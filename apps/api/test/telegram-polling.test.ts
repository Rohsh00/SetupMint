import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { TelegramPollingService } from '../src/services/telegram-polling.service.js';
import { TelegramAlertService } from '../src/services/telegram-alert.service.js';
import { User, TelegramUpdateAudit, TelegramCallbackLock } from '../src/db/models/index.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';

describe('Telegram Polling Service & Callback Handling Tests', () => {
  beforeAll(async () => {
    await connectDatabase();
    await TelegramCallbackLock.deleteMany({});
  });

  afterAll(async () => {
    TelegramPollingService.stop();
    await disconnectDatabase();
  });

  it('tracks polling status correctly for registered bot tokens', () => {
    const testToken = '123456789:TEST_POLLING_BOT_TOKEN_TRACKING';
    expect(TelegramPollingService.isPolling(testToken)).toBe(false);

    // Mock fetch for getUpdates and deleteWebhook
    vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('deleteWebhook')) {
        return { ok: true, json: async () => ({ ok: true, result: true }) } as any;
      }
      if (urlStr.includes('getUpdates')) {
        // Return empty updates array
        return { ok: true, json: async () => ({ ok: true, result: [] }) } as any;
      }
      return { ok: true, json: async () => ({ ok: true }) } as any;
    });

    TelegramPollingService.startPollingForBot(testToken);
    expect(TelegramPollingService.isPolling(testToken)).toBe(true);

    TelegramPollingService.stopPollingForBot(testToken);
    expect(TelegramPollingService.isPolling(testToken)).toBe(false);
  });

  it('processes incoming callback query updates through processWebhookUpdate with knownBotToken', async () => {
    const answeredCallbacks: any[] = [];
    vi.spyOn(TelegramAlertService as any, 'answerCallbackQuery').mockImplementation(
      async (botToken: string, callbackQueryId: string, text?: string) => {
        answeredCallbacks.push({ botToken, callbackQueryId, text });
      }
    );

    const testToken = '123456789:TEST_CALLBACK_BOT_TOKEN';
    const update = {
      update_id: 889901,
      callback_query: {
        id: 'cq_test_123',
        from: { id: 99887766 },
        message: {
          message_id: 5544,
          chat: { id: 99887766 },
          text: 'Alert text',
        },
        data: 'cmd_pnl',
      },
    };

    // Clean up audit entry if exists
    await TelegramUpdateAudit.deleteMany({ updateId: 889901 });

    await TelegramAlertService.processWebhookUpdate(update, testToken);

    // Callback query must be acknowledged (answered) so Telegram button stops spinning
    expect(answeredCallbacks.length).toBeGreaterThan(0);
    expect(answeredCallbacks[0].callbackQueryId).toBe('cq_test_123');
  });

  it('always acknowledges callback queries even for unlinked chats to prevent indefinite spinner', async () => {
    const answeredAlerts: any[] = [];
    vi.spyOn(TelegramAlertService as any, 'answerCallbackQuery').mockImplementation(
      async (botToken: string, callbackQueryId: string, text?: string, showAlert?: boolean) => {
        answeredAlerts.push({ botToken, callbackQueryId, text, showAlert });
      }
    );

    const testToken = '123456789:UNLINKED_TEST_BOT_TOKEN';
    const update = {
      update_id: 889902,
      callback_query: {
        id: 'cq_unlinked_999',
        from: { id: 77777777 },
        message: {
          message_id: 5545,
          chat: { id: 77777777 },
          text: 'Some alert',
        },
        data: 'cmd_trades',
      },
    };

    await TelegramUpdateAudit.deleteMany({ updateId: 889902 });
    await TelegramAlertService.processWebhookUpdate(update, testToken);

    expect(answeredAlerts.length).toBeGreaterThan(0);
    expect(answeredAlerts[0].callbackQueryId).toBe('cq_unlinked_999');
  });
});

