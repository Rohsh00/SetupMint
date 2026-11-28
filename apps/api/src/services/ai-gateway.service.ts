/**
 * SetupMint - Multi-Provider AI Gateway & Local LLM Bridge Service
 *
 * Provides a unified abstraction layer over:
 * 1. Google Gemini Flash API (Cloud High-Speed)
 * 2. Local Ollama Instances (100% Offline, Privacy-First)
 * 3. Local OpenAI-Compatible APIs (LM Studio, vLLM, LocalAI)
 *
 * Guarantees zero cloud telemetry for local users and transparent model fallbacks.
 */

import { User } from '../db/models/index.js';
import { config } from '../config.js';
import { safeDecryptSecret } from './crypto.service.js';
import { AiUsageTrackerService } from './ai-usage-tracker.service.js';

export interface IGatewayRequest {
  user: any;
  systemPrompt: string;
  prompt: string;
  feature?: string;
  preferredModel?: string;
  timeoutMs?: number;
}

export interface IGatewayResponse {
  text: string;
  json?: any;
  modelUsed: string;
  provider: 'GEMINI' | 'OLLAMA' | 'LOCAL_OPENAI';
  latencyMs: number;
}

export class AiGatewayService {
  /**
   * Dispatches a prompt through the user's selected provider (Gemini or Local).
   */
  static async execute(req: IGatewayRequest): Promise<IGatewayResponse> {
    const startTime = Date.now();
    const { user, systemPrompt, prompt, feature = 'GENERAL', preferredModel, timeoutMs = 15000 } = req;
    const provider = user?.aiSettings?.provider || 'GEMINI';
    const userId = user?._id || user?.id;

    // 1. Local Ollama Provider
    if (provider === 'OLLAMA') {
      const endpoint = user?.aiSettings?.localEndpoint || 'http://localhost:11434';
      const model = user?.aiSettings?.localModel || 'llama3.3:8b';
      const res = await this.callOllama({ endpoint, model, systemPrompt, prompt, timeoutMs });
      return {
        text: res,
        json: this.tryParseJson(res),
        modelUsed: `Ollama (${model})`,
        provider: 'OLLAMA',
        latencyMs: Date.now() - startTime,
      };
    }

    // 2. Local OpenAI-Compatible Provider (LM Studio, vLLM)
    if (provider === 'LOCAL_OPENAI') {
      const endpoint = user?.aiSettings?.localEndpoint || 'http://localhost:1234/v1';
      const model = user?.aiSettings?.localModel || 'default';
      const res = await this.callLocalOpenAi({ endpoint, model, systemPrompt, prompt, timeoutMs });
      return {
        text: res,
        json: this.tryParseJson(res),
        modelUsed: `Local (${model})`,
        provider: 'LOCAL_OPENAI',
        latencyMs: Date.now() - startTime,
      };
    }

    // 3. Google Gemini Cloud API
    let geminiApiKey: string | undefined = undefined;
    if (user?.aiSettings?.geminiApiKey) {
      const dec = safeDecryptSecret(user.aiSettings.geminiApiKey);
      geminiApiKey = dec || (user.aiSettings.geminiApiKey.startsWith('••') ? undefined : user.aiSettings.geminiApiKey);
    }
    if (!geminiApiKey && config.geminiApiKey) {
      geminiApiKey = config.geminiApiKey;
    }

    if (!geminiApiKey) {
      throw new Error('No Gemini API key available and local provider is not configured.');
    }

    const candidateModels = [
      preferredModel || user?.aiSettings?.model,
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-3.8-flash',
      'gemini-3.5-flash-lite',
      'gemini-flash-latest',
    ].filter(Boolean) as string[];

    for (const model of candidateModels) {
      if (userId) {
        AiUsageTrackerService.recordRequest(userId, feature, model).catch(() => {});
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json',
            },
          }),
        });

        clearTimeout(timeout);

        if (!response.ok) {
          if (response.status === 429 && userId) {
            AiUsageTrackerService.recordRateLimit(userId, feature, model).catch(() => {});
          }
          continue;
        }

        const resJson: any = await response.json();
        const rawText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) continue;

        return {
          text: rawText,
          json: this.tryParseJson(rawText),
          modelUsed: model,
          provider: 'GEMINI',
          latencyMs: Date.now() - startTime,
        };
      } catch (err) {
        clearTimeout(timeout);
        // Fall back to next model
      }
    }

    throw new Error('All Gemini candidate models failed to produce a valid response.');
  }

  private static async callOllama(params: {
    endpoint: string;
    model: string;
    systemPrompt: string;
    prompt: string;
    timeoutMs: number;
  }): Promise<string> {
    const url = `${params.endpoint.replace(/\/+$/, '')}/api/chat`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), params.timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: params.model,
          messages: [
            { role: 'system', content: params.systemPrompt },
            { role: 'user', content: params.prompt },
          ],
          stream: false,
          format: 'json',
        }),
      });

      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Ollama returned status ${res.status}`);
      const data: any = await res.json();
      return data?.message?.content || '';
    } catch (err: any) {
      clearTimeout(timeout);
      throw new Error(`Failed to communicate with local Ollama instance at ${params.endpoint}: ${err.message}`);
    }
  }

  private static async callLocalOpenAi(params: {
    endpoint: string;
    model: string;
    systemPrompt: string;
    prompt: string;
    timeoutMs: number;
  }): Promise<string> {
    const baseUrl = params.endpoint.replace(/\/+$/, '');
    const url = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), params.timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: params.model,
          messages: [
            { role: 'system', content: params.systemPrompt },
            { role: 'user', content: params.prompt },
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' },
        }),
      });

      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Local OpenAI server returned status ${res.status}`);
      const data: any = await res.json();
      return data?.choices?.[0]?.message?.content || '';
    } catch (err: any) {
      clearTimeout(timeout);
      throw new Error(`Failed to communicate with local OpenAI endpoint at ${params.endpoint}: ${err.message}`);
    }
  }

  private static tryParseJson(text: string): any {
    try {
      return JSON.parse(text);
    } catch {
      // Try extract JSON substring if wrapped in markdown blocks
      const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        try {
          return JSON.parse(match[1]);
        } catch {
          return null;
        }
      }
      return null;
    }
  }
}

