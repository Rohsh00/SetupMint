/**
 * SetupMint - Telegram AI Voice Journaling & Emotional Sentiment Service
 *
 * Transcribes audio voice notes sent to the Telegram bot:
 * 1. Downloads audio stream directly from Telegram Bot API
 * 2. Transcribes voice note and extracts trader's psychological tone (TILT, CONFIDENT, DISCIPLINED)
 * 3. Appends reflection to today's DailyJournal with zero manual typing friction
 */

import mongoose from 'mongoose';
import { DailyJournal, User, Trade } from '../db/models/index.js';
import { config } from '../config.js';
import { safeDecryptSecret } from './crypto.service.js';
import { AiUsageTrackerService } from './ai-usage-tracker.service.js';

export class AiVoiceJournalService {
  /**
   * Processes an audio voice message: downloads/accepts buffer, transcribes, evaluates psychology,
   * updates the linked Trade (if specified), and logs to today's DailyJournal with zero manual typing.
   */
  static async processVoiceMessage(params: {
    userId: string | mongoose.Types.ObjectId;
    botToken?: string;
    fileId?: string;
    audioBuffer?: Buffer;
    mimeType?: string;
    caption?: string;
    tradeId?: string | mongoose.Types.ObjectId;
  }): Promise<{
    transcription: string;
    emotionalState: string;
    disciplineScore: number;
    lessonsLearned: string;
    identifiedMistakes: string[];
    journalDate: string;
    tradeId?: string;
  }> {
    const { userId, botToken, fileId, caption, tradeId } = params;
    const uId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    const user = await User.findById(uId).lean();
    const todayStr = new Date().toISOString().slice(0, 10);

    let audioBuffer: Buffer;
    let mimeType = params.mimeType || 'audio/ogg';

    if (params.audioBuffer) {
      audioBuffer = params.audioBuffer;
    } else if (botToken && fileId) {
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

      audioBuffer = Buffer.from(await audioRes.arrayBuffer());
      if (filePath.endsWith('.mp3')) mimeType = 'audio/mpeg';
      else if (filePath.endsWith('.m4a')) mimeType = 'audio/mp4';
      else if (filePath.endsWith('.wav')) mimeType = 'audio/wav';
      else mimeType = 'audio/ogg';
    } else {
      throw new Error('Either audioBuffer or botToken and fileId must be provided for voice processing.');
    }

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
    let identifiedMistakes: string[] = [];

    if (geminiApiKey) {
      try {
        AiUsageTrackerService.recordRequest(uId, 'VOICE_JOURNAL', 'gemini-2.5-flash').catch(() => {});

        const systemPrompt = `You are a trader psychology coach and voice transcription engine.
Transcribe the trader's audio voice note exactly.
Analyze their emotional state, sentiment, and execution discipline:
- emotionalState: "CONFIDENT" | "FRUSTRATED" | "TILTED" | "FEARFUL" | "GREEDY" | "DISCIPLINED"
- disciplineScore: number (1 to 5)
- lessonsLearned: 1-2 sentence key takeaway or operational rule extracted from what they said
- identifiedMistakes: array of strings of any trading errors mentioned (e.g. "EXITED_EARLY", "MOVED_STOP_LOSS", "REVENGE_TRADE", "OVERSIZED", "FOMO_ENTRY", "CHASED_ENTRY", "WIDER_STOP", "NO_STOP_LOSS")
- cleanTranscription: accurate text of what was spoken

Respond strictly in valid JSON:
{
  "cleanTranscription": string,
  "emotionalState": string,
  "disciplineScore": number,
  "lessonsLearned": string,
  "identifiedMistakes": string[]
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
                      mime_type: mimeType,
                      data: base64Audio,
                    },
                  },
                  { text: 'Transcribe this voice journal entry, analyze trader psychology, identify trading mistakes, and extract lessons.' },
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
            if (Array.isArray(parsed.identifiedMistakes)) {
              identifiedMistakes = parsed.identifiedMistakes.filter((m: any) => typeof m === 'string');
            }
          }
        }
      } catch (err: any) {
        console.warn('[AiVoiceJournalService] Gemini voice processing failed:', err.message);
      }
    }

    // 4. If tradeId is provided, attach and update the Trade model directly
    let linkedTradeIdStr: string | undefined = undefined;
    if (tradeId) {
      const tOid = typeof tradeId === 'string' ? new mongoose.Types.ObjectId(tradeId) : tradeId;
      const targetTrade = await Trade.findOne({ _id: tOid, userId: uId });
      if (targetTrade) {
        linkedTradeIdStr = targetTrade._id.toString();
        if (!targetTrade.psychology) {
          targetTrade.psychology = {} as any;
        }

        const timeIST = new Date().toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
        });
        const tradeNote = `[${timeIST} IST] 🎙️ **Voice Reflection:** "${transcription}"\n• Sentiment: ${emotionalState} | Lesson: ${lessonsLearned}`;
        const existingNotes = targetTrade.psychology.notes || '';
        targetTrade.psychology.notes = existingNotes ? `${existingNotes}\n\n${tradeNote}` : tradeNote;
        targetTrade.psychology.emotionAfter = emotionalState;
        targetTrade.psychology.disciplineScore = disciplineScore;
        targetTrade.psychology.lessonsLearned = lessonsLearned;

        if (identifiedMistakes.length > 0) {
          const currentMistakes = new Set(targetTrade.psychology.mistakes || []);
          for (const m of identifiedMistakes) {
            currentMistakes.add(m);
          }
          targetTrade.psychology.mistakes = Array.from(currentMistakes);
        }

        targetTrade.auditLog.push({
          action: 'AI_VOICE_REFLECTION_PROCESSED',
          timestamp: new Date(),
          details: {
            emotionalState,
            disciplineScore,
            lessonsLearned,
            identifiedMistakes,
          },
          changedBy: 'ai',
        });

        await targetTrade.save();
      }
    }

    // 5. Append to DailyJournal for today
    const journalEntry = await DailyJournal.findOne({ userId: uId, date: todayStr });
    const existingNotes = journalEntry?.notes ? `${journalEntry.notes}\n\n` : '';
    const mistakesSuffix = identifiedMistakes.length > 0 ? ` | *Detected Errors:* ${identifiedMistakes.join(', ')}` : '';
    const updatedNotes = `${existingNotes}🎙️ **Voice Reflection (${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}):**\n${transcription}\n*Emotional State:* ${emotionalState} | *Discipline:* ${disciplineScore}/5${mistakesSuffix}\n*Key Lesson:* ${lessonsLearned}`;

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
      identifiedMistakes,
      journalDate: todayStr,
      tradeId: linkedTradeIdStr,
    };
  }
}

