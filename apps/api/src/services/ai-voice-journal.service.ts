/**
 * SetupMint - Telegram AI Voice Journaling & Emotional Sentiment Service
 *
 * Transcribes audio voice notes sent to the Telegram bot:
 * 1. Downloads audio stream directly from Telegram Bot API
 * 2. Transcribes voice note and extracts trader's psychological tone (TILT, CONFIDENT, DISCIPLINED)
 * 3. Appends reflection to today's DailyJournal with zero manual typing friction
 */

import mongoose from 'mongoose';
import { DailyJournal, User } from '../db/models/index.js';
import { config } from '../config.js';
import { safeDecryptSecret } from './crypto.service.js';
import { AiUsageTrackerService } from './ai-usage-tracker.service.js';

export class AiVoiceJournalService {
  /**
   * Processes a Telegram voice file: downloads, transcribes, evaluates psychology, and logs to DailyJournal.
   */
  static async processVoiceMessage(params: {
    userId: string | mongoose.Types.ObjectId;
    botToken: string;
    fileId: string;
    caption?: string;
  }): Promise<{
    transcription: string;
    emotionalState: string;
    disciplineScore: number;
    lessonsLearned: string;
    journalDate: string;
  }> {
    const { userId, botToken, fileId, caption } = params;
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const user = await User.findById(uId).lean();
    const todayStr = new Date().toISOString().slice(0, 10);

    // 1. Fetch file path from Telegram Bot API
    const realToken = safeDecryptSecret(botToken) || (botToken.startsWith('enc:') ? null : botToken);
    if (!realToken) {
      throw new Error('Invalid bot token for voice message processing.');
    }

    const getFileUrl = `https://api.telegram.org/bot${realToken}/getFile?file_id=${fileId}`;
    const fileRes = await fetch(getFileUrl);
    if (!fileRes.ok) {
      throw new Error('Failed to retrieve voice file details from Telegram API.');
    }

    const fileJson: any = await fileRes.json();
    const filePath = fileJson?.result?.file_path;
    if (!filePath) {
      throw new Error('Telegram file path not found.');
    }

    // 2. Download audio binary
    const downloadUrl = `https://api.telegram.org/file/bot${realToken}/${filePath}`;
    const audioRes = await fetch(downloadUrl);
    if (!audioRes.ok) {
      throw new Error('Failed to download voice binary from Telegram servers.');
    }

    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    const base64Audio = audioBuffer.toString('base64');

    // 3. Check for Gemini API key
    let geminiApiKey: string | undefined = undefined;
    if (user?.aiSettings?.geminiApiKey) {
      const dec = safeDecryptSecret(user.aiSettings.geminiApiKey);
      geminiApiKey = dec || (user.aiSettings.geminiApiKey.startsWith('••') ? undefined : user.aiSettings.geminiApiKey);
    }
    if (!geminiApiKey && config.geminiApiKey) {
      geminiApiKey = config.geminiApiKey;
    }

    let transcription = caption || 'Voice reflection recorded.';
    let emotionalState = 'DISCIPLINED';
    let disciplineScore = 4;
    let lessonsLearned = 'Maintained trade reflection consistency.';

    if (geminiApiKey) {
      try {
        AiUsageTrackerService.recordRequest(uId, 'VOICE_JOURNAL', 'gemini-2.5-flash').catch(() => {});

        const systemPrompt = `You are a trader psychology coach and voice transcription engine.
Transcribe the trader's audio voice note exactly.
Analyze their emotional state and vocal sentiment:
- emotionalState: "CONFIDENT" | "FRUSTRATED" | "TILTED" | "FEARFUL" | "GREEDY" | "DISCIPLINED"
- disciplineScore: number (1 to 5)
- lessonsLearned: 1-2 sentence key takeaway extracted from what they said
- cleanTranscription: accurate text of what was spoken

Respond strictly in valid JSON:
{
  "cleanTranscription": string,
  "emotionalState": string,
  "disciplineScore": number,
  "lessonsLearned": string
}`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [
              {
                parts: [
                  {
                    inline_data: {
                      mime_type: 'audio/ogg',
                      data: base64Audio,
                    },
                  },
                  { text: 'Transcribe this voice journal entry and analyze trader psychology.' },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json',
            },
          }),
        });

        clearTimeout(timeout);

        if (res.ok) {
          const resJson: any = await res.json();
          const rawText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            const parsed = JSON.parse(rawText);
            transcription = parsed.cleanTranscription || transcription;
            emotionalState = parsed.emotionalState || emotionalState;
            disciplineScore = parsed.disciplineScore || disciplineScore;
            lessonsLearned = parsed.lessonsLearned || lessonsLearned;
          }
        }
      } catch (err: any) {
        console.warn('[AiVoiceJournalService] Gemini voice processing failed:', err.message);
      }
    }

    // 4. Append to DailyJournal for today
    const journalEntry = await DailyJournal.findOne({ userId: uId, date: todayStr });
    const existingNotes = journalEntry?.notes ? `${journalEntry.notes}\n\n` : '';
    const updatedNotes = `${existingNotes}🎙️ **Voice Reflection (${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}):**\n${transcription}\n*Emotional State:* ${emotionalState} | *Key Lesson:* ${lessonsLearned}`;

    await DailyJournal.findOneAndUpdate(
      { userId: uId, date: todayStr },
      {
        $set: {
          notes: updatedNotes,
          emotionalState: emotionalState as any,
          lessonsLearned: lessonsLearned,
        },
      },
      { upsert: true, new: true }
    );

    return {
      transcription,
      emotionalState,
      disciplineScore,
      lessonsLearned,
      journalDate: todayStr,
    };
  }
}

