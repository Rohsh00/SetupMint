import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';
import { TelegramAlertService } from '../src/services/telegram-alert.service.js';
import { User, Trade, Attachment, TelegramUpdateAudit } from '../src/db/models/index.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { InMemoryStorage } from './in-memory-storage.js';
import { setStorageForTests } from '../src/storage/index.js';
import { encryptSecret } from '../src/services/crypto.service.js';

describe('Telegram Voice Reflections Integration Tests', () => {
  let testStorage: InMemoryStorage;
  let testUser: any;
  let testTrade: any;
  const testChatId = '987654321';
  const testBotToken = '123456:VOICE_TEST_BOT_TOKEN';

  beforeAll(async () => {
    await connectDatabase();
    testStorage = new InMemoryStorage();
    setStorageForTests(testStorage);

    // Create test user with telegram configured
    testUser = await User.create({
      name: 'Voice Reflection Trader',
      email: `voice-trader-${Date.now()}@example.com`,
      passwordHash: 'dummy_hash',
      baseCurrency: 'INR',
      liveWatcherSettings: {
        telegramAlertsEnabled: true,
        telegramBotToken: encryptSecret(testBotToken),
        telegramChatId: testChatId,
      },
    });

    // Create active trade for user
    testTrade = await Trade.create({
      userId: testUser._id,
      accountId: new mongoose.Types.ObjectId(),
      exchange: 'NSE',
      marketSegment: 'NSE_EQ',
      symbol: 'NSE:RELIANCE-EQ',
      assetClass: 'EQUITY',
      direction: 'LONG',
      tradeDate: '2026-11-02',
      entryTime: new Date(),
      quantity: 100,
      status: 'OPEN',
      simpleExecution: {
        entryPrice: 2800,
        quantity: 100,
      },
      notes: 'Initial trade entry notes',
      screenshotIds: [],
      auditLog: [],
    });
  });

  afterAll(async () => {
    setStorageForTests(null);
    if (testUser) {
      await Attachment.deleteMany({ userId: testUser._id });
      await Trade.deleteMany({ userId: testUser._id });
      await User.deleteOne({ _id: testUser._id });
    }
    await TelegramUpdateAudit.deleteMany({});
    await disconnectDatabase();
  });

  it('successfully processes a voice note replied to a trade alert and attaches it to trade', async () => {
    const sentMessages: any[] = [];
    vi.spyOn(TelegramAlertService as any, 'sendMessage').mockImplementation(
      async (botToken: string, chatId: string | number, text: string, replyMarkup?: any) => {
        sentMessages.push({ botToken, chatId, text, replyMarkup });
        return { ok: true, result: { message_id: 1122 } };
      }
    );

    const fakeOggBuffer = Buffer.from('OggS\x00\x02\x00\x00\x00\x00\x00\x00\x00\x00test voice payload');

    // Mock fetch for Telegram getFile and audio download
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/getFile')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            result: {
              file_id: 'voice_file_abc123',
              file_path: 'voice/file_0.oga',
              file_size: fakeOggBuffer.length,
            },
          }),
        } as any;
      }
      if (urlStr.includes('/file/bot') && urlStr.includes('file_0.oga')) {
        return {
          ok: true,
          arrayBuffer: async () => fakeOggBuffer.buffer,
        } as any;
      }
      return { ok: true, json: async () => ({ ok: true }) } as any;
    });

    const update = {
      update_id: 991001,
      message: {
        message_id: 4001,
        chat: { id: Number(testChatId) },
        from: { id: Number(testChatId), first_name: 'Trader' },
        voice: {
          file_id: 'voice_file_abc123',
          duration: 18,
          mime_type: 'audio/ogg',
          file_size: fakeOggBuffer.length,
        },
        reply_to_message: {
          message_id: 3999,
          text: `🚨 Trade Alert: ${testTrade.symbol} OPENED`,
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🔍 Details',
                  callback_data: `x:${testTrade._id.toString()}:details`,
                },
              ],
            ],
          },
        },
      },
    };

    await TelegramAlertService.processWebhookUpdate(update, testBotToken);

    // 1. Verify Attachment created in database
    const attachment = await Attachment.findOne({
      userId: testUser._id,
      tradeId: testTrade._id,
    });
    expect(attachment).not.toBeNull();
    expect(attachment?.category).toBe('REVIEW');
    expect(attachment?.mimeType).toBe('audio/ogg');
    expect(attachment?.description).toContain('Voice Reflection');
    expect(attachment?.description).toContain('18s');

    // 2. Verify storage provider saved file
    const stored = await testStorage.read(attachment!.storedFilename);
    expect(stored).toBeDefined();

    // 3. Verify Trade updated with screenshotId and note
    const updatedTrade = await Trade.findById(testTrade._id);
    expect(updatedTrade?.screenshotIds.map(String)).toContain(attachment!._id.toString());
    expect(updatedTrade?.psychology?.notes).toContain('Voice Note (18s) recorded via Telegram');
    const voiceAudit = updatedTrade?.auditLog.find((a: any) => a.action === 'VOICE_REFLECTION_ATTACHED');
    expect(voiceAudit).toBeDefined();
    expect(voiceAudit?.details?.duration).toBe(18);

    // 4. Verify Telegram confirmation response
    expect(sentMessages.length).toBeGreaterThan(0);
    const lastMsg = sentMessages[sentMessages.length - 1];
    expect(lastMsg.text).toContain('Voice Reflection Attached');
    expect(lastMsg.text).toContain(testTrade.symbol);
    expect(lastMsg.text).toContain('18s');
  });

  it('falls back to latest open trade when voice note is not a direct reply', async () => {
    const sentMessages: any[] = [];
    vi.spyOn(TelegramAlertService as any, 'sendMessage').mockImplementation(
      async (botToken: string, chatId: string | number, text: string, replyMarkup?: any) => {
        sentMessages.push({ botToken, chatId, text, replyMarkup });
        return { ok: true, result: { message_id: 1123 } };
      }
    );

    const fakeAudioBuffer = Buffer.from('fake mp3 voice audio buffer');
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/getFile')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            result: {
              file_id: 'audio_file_xyz789',
              file_path: 'audio/file_1.mp3',
              file_size: fakeAudioBuffer.length,
            },
          }),
        } as any;
      }
      if (urlStr.includes('/file/bot') && urlStr.includes('file_1.mp3')) {
        return {
          ok: true,
          arrayBuffer: async () => fakeAudioBuffer.buffer,
        } as any;
      }
      return { ok: true, json: async () => ({ ok: true }) } as any;
    });

    const update = {
      update_id: 991002,
      message: {
        message_id: 4002,
        chat: { id: Number(testChatId) },
        from: { id: Number(testChatId) },
        audio: {
          file_id: 'audio_file_xyz789',
          duration: 35,
          mime_type: 'audio/mpeg',
          file_size: fakeAudioBuffer.length,
        },
      },
    };

    await TelegramAlertService.processWebhookUpdate(update, testBotToken);

    // Should link to testTrade because it is the latest open trade
    const attachments = await Attachment.find({
      userId: testUser._id,
      tradeId: testTrade._id,
    });
    expect(attachments.length).toBe(2);

    const latest = attachments[attachments.length - 1];
    expect(latest.description).toContain('35s');
    expect(latest.mimeType).toBe('audio/mpeg');
  });

  it('notifies unknown telegram user with instructions and their Chat ID', async () => {
    const sentMessages: any[] = [];
    vi.spyOn(TelegramAlertService as any, 'sendMessage').mockImplementation(
      async (botToken: string, chatId: string | number, text: string) => {
        sentMessages.push({ botToken, chatId, text });
        return { ok: true, result: { message_id: 1124 } };
      }
    );

    const unknownChatId = 11223344;
    const update = {
      update_id: 991003,
      message: {
        message_id: 4003,
        chat: { id: unknownChatId },
        from: { id: unknownChatId },
        voice: {
          file_id: 'voice_unknown_999',
          duration: 5,
          mime_type: 'audio/ogg',
        },
      },
    };

    await TelegramAlertService.processWebhookUpdate(update, 'UNKNOWN_BOT_TOKEN_999');

    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].chatId).toBe(unknownChatId);
    expect(sentMessages[0].text).toContain(String(unknownChatId));
    expect(sentMessages[0].text).toContain('SetupMint Settings');
  });
});
