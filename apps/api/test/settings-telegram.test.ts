import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { User } from '../src/db/models/index.js';
import { TelegramAlertService } from '../src/services/telegram-alert.service.js';
import { decryptSecret, isEncryptedSecret } from '../src/services/crypto.service.js';

describe('Telegram Settings Persistence & Live Watcher Isolation', () => {
  let app: FastifyInstance;
  let authCookie: string;
  let userId: string;
  const testBotToken = '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ';
  const testChatId = '987654321';

  beforeAll(async () => {
    vi.spyOn(TelegramAlertService, 'testConnection').mockResolvedValue({
      success: true,
      message: 'Telegram test message delivered successfully! Interactive buttons armed.',
    });

    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Register a test user
    const email = `tg_user_${Date.now()}@tradevault.local`;
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email,
        password: 'Password123!',
        name: 'Telegram QA Trader',
        baseCurrency: 'INR',
      },
    });

    expect(regRes.statusCode).toBe(201);
    const body = JSON.parse(regRes.body);
    userId = body.data.user.id;
    const cookies = regRes.headers['set-cookie'];
    authCookie = Array.isArray(cookies) ? cookies[0] : (cookies as string);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await app.close();
    await disconnectDatabase();
  });

  it('1. Successfully saves and encrypts Telegram credentials in liveWatcherSettings', async () => {
    const updateRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings/profile',
      headers: { cookie: authCookie },
      payload: {
        liveWatcherSettings: {
          telegramAlertsEnabled: true,
          telegramBotToken: testBotToken,
          telegramChatId: testChatId,
          slippageGuardPercent: 0.8,
        },
      },
    });

    expect(updateRes.statusCode).toBe(200);
    const body = JSON.parse(updateRes.body);
    expect(body.success).toBe(true);
    // Returned token in response MUST be masked
    expect(body.data.liveWatcherSettings.telegramBotToken).toBe('••••••••');
    expect(body.data.liveWatcherSettings.telegramChatId).toBe(testChatId);
    expect(body.data.liveWatcherSettings.telegramAlertsEnabled).toBe(true);

    // Verify DB storage: must be stored encrypted with enc:v1: prefix
    const userDoc = await User.findById(userId);
    expect(userDoc).toBeDefined();
    const storedToken = userDoc?.liveWatcherSettings?.telegramBotToken;
    expect(storedToken).toBeDefined();
    expect(isEncryptedSecret(storedToken)).toBe(true);
    expect(decryptSecret(storedToken)).toBe(testBotToken);
    expect(userDoc?.liveWatcherSettings?.telegramChatId).toBe(testChatId);
    expect(userDoc?.liveWatcherSettings?.telegramAlertsEnabled).toBe(true);
  });

  it('2. GET /profile and GET /auth/me return masked token and real chatId', async () => {
    const profileRes = await app.inject({
      method: 'GET',
      url: '/api/v1/settings/profile',
      headers: { cookie: authCookie },
    });
    expect(profileRes.statusCode).toBe(200);
    const profileBody = JSON.parse(profileRes.body);
    expect(profileBody.data.liveWatcherSettings.telegramBotToken).toBe('••••••••');
    expect(profileBody.data.liveWatcherSettings.telegramChatId).toBe(testChatId);
    expect(profileBody.data.liveWatcherSettings.telegramAlertsEnabled).toBe(true);

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: authCookie },
    });
    expect(meRes.statusCode).toBe(200);
    const meBody = JSON.parse(meRes.body);
    expect(meBody.data.user.liveWatcherSettings.telegramBotToken).toBe('••••••••');
    expect(meBody.data.user.liveWatcherSettings.telegramChatId).toBe(testChatId);
    expect(meBody.data.user.liveWatcherSettings.telegramAlertsEnabled).toBe(true);
  });

  it('3. Updating profile with masked token •••••••• preserves the original encrypted token', async () => {
    const updateRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings/profile',
      headers: { cookie: authCookie },
      payload: {
        liveWatcherSettings: {
          telegramBotToken: '••••••••',
          telegramChatId: testChatId,
          telegramAlertsEnabled: true,
          slippageGuardPercent: 1.2,
        },
      },
    });

    expect(updateRes.statusCode).toBe(200);
    const body = JSON.parse(updateRes.body);
    expect(body.data.liveWatcherSettings.slippageGuardPercent).toBe(1.2);
    expect(body.data.liveWatcherSettings.telegramBotToken).toBe('••••••••');

    // DB verify: token was NOT overwritten with bullet points
    const userDoc = await User.findById(userId);
    expect(decryptSecret(userDoc?.liveWatcherSettings?.telegramBotToken)).toBe(testBotToken);
  });

  it('4. Partial updates from LiveOpenTradeWatcher (e.g. cardDensity, sortMode) NEVER wipe Telegram settings', async () => {
    // Simulate user pressing '1' in LiveOpenTradeWatcher to switch to 'glance'
    const glanceRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings/profile',
      headers: { cookie: authCookie },
      payload: {
        liveWatcherSettings: { cardDensity: 'glance' },
      },
    });
    expect(glanceRes.statusCode).toBe(200);

    // Simulate user toggling sort mode to 'urgency'
    const sortRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings/profile',
      headers: { cookie: authCookie },
      payload: {
        liveWatcherSettings: { sortMode: 'urgency' },
      },
    });
    expect(sortRes.statusCode).toBe(200);

    // Simulate user toggling ladder view mode to 'vertical'
    const ladderRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings/profile',
      headers: { cookie: authCookie },
      payload: {
        liveWatcherSettings: { ladderViewMode: 'vertical' },
      },
    });
    expect(ladderRes.statusCode).toBe(200);

    // Verify DB: Telegram credentials and alerts flag MUST still be 100% intact!
    const userDoc = await User.findById(userId);
    expect(userDoc?.liveWatcherSettings?.cardDensity).toBe('glance');
    expect(userDoc?.liveWatcherSettings?.sortMode).toBe('urgency');
    expect(userDoc?.liveWatcherSettings?.ladderViewMode).toBe('vertical');

    expect(userDoc?.liveWatcherSettings?.telegramChatId).toBe(testChatId);
    expect(userDoc?.liveWatcherSettings?.telegramAlertsEnabled).toBe(true);
    expect(userDoc?.liveWatcherSettings?.telegramBotToken).toBeDefined();
    expect(decryptSecret(userDoc?.liveWatcherSettings?.telegramBotToken)).toBe(testBotToken);
  });

  it('5. POST /test-telegram decrypts and tests stored token when masked •••••••• is passed', async () => {
    const testRes = await app.inject({
      method: 'POST',
      url: '/api/v1/settings/test-telegram',
      headers: { cookie: authCookie },
      payload: {
        botToken: '••••••••',
        chatId: testChatId,
      },
    });

    expect(testRes.statusCode).toBe(200);
    const body = JSON.parse(testRes.body);
    expect(body.success).toBe(true);

    const userDoc = await User.findById(userId);
    expect(decryptSecret(userDoc?.liveWatcherSettings?.telegramBotToken)).toBe(testBotToken);
  });

  it('6. Explicit disconnect with clearTelegramCredentials cleanly unsets credentials', async () => {
    const clearRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/settings/profile',
      headers: { cookie: authCookie },
      payload: {
        liveWatcherSettings: {
          clearTelegramCredentials: true,
          telegramAlertsEnabled: false,
          telegramBotToken: '',
          telegramChatId: '',
        },
      },
    });

    expect(clearRes.statusCode).toBe(200);
    const body = JSON.parse(clearRes.body);
    expect(body.data.liveWatcherSettings.telegramBotToken).toBeUndefined();
    expect(body.data.liveWatcherSettings.telegramAlertsEnabled).toBe(false);

    const userDoc = await User.findById(userId);
    expect(userDoc?.liveWatcherSettings?.telegramBotToken).toBeUndefined();
    expect(userDoc?.liveWatcherSettings?.telegramChatId).toBeUndefined();
    expect(userDoc?.liveWatcherSettings?.telegramAlertsEnabled).toBe(false);
  });
});
