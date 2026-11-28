import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const execFileAsync = promisify(execFile);
import { DEFAULT_PATTERN_DETECTION_SETTINGS, DEFAULT_LIVE_WATCHER_SETTINGS } from '@tradevault/shared';
import { User, Trade, TradingAccount, Attachment, Session } from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { BackupStatusService } from '../services/backup-status.service.js';
import { TelegramAlertService } from '../services/telegram-alert.service.js';
import { TelegramPollingService } from '../services/telegram-polling.service.js';
import { EconomicCalendarService } from '../services/economic-calendar.service.js';
import { encryptSecret, decryptSecret, safeDecryptSecret } from '../services/crypto.service.js';
import { config } from '../config.js';

function maskLiveWatcherSettings(settings: any) {
  if (!settings) return DEFAULT_LIVE_WATCHER_SETTINGS;
  const s = typeof settings.toObject === 'function' ? settings.toObject() : { ...settings };
  if (s.telegramBotToken) {
    s.telegramBotToken = '••••••••';
  } else {
    delete s.telegramBotToken;
  }
  return s;
}

export const settingsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  // Update profile / base currency / theme
  // Get user profile including riskSettings & patternDetectionSettings
  app.get('/profile', async (req: any, reply) => {
    const user = await User.findById(req.user!.id);
    if (!user) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    return reply.send({
      success: true,
      data: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        baseCurrency: user.baseCurrency,
        theme: user.theme,
        defaultAccountScope: user.defaultAccountScope || 'ALL',
        riskSettings: user.riskSettings,
        patternDetectionSettings: user.patternDetectionSettings || DEFAULT_PATTERN_DETECTION_SETTINGS,
        liveWatcherSettings: maskLiveWatcherSettings(user.liveWatcherSettings),
        aiSettings: user.aiSettings ? {
          enabled: user.aiSettings.enabled ?? true,
          model: user.aiSettings.model || 'gemini-3.5-flash-lite',
          autoAnalyzeTrades: user.aiSettings.autoAnalyzeTrades ?? true,
          autoApplyTradeDetails: user.aiSettings.autoApplyTradeDetails ?? false,
          hasGeminiApiKey: Boolean(user.aiSettings.geminiApiKey || config.geminiApiKey),
          geminiApiKey: user.aiSettings.geminiApiKey ? '••••••••' : (config.geminiApiKey ? '•••••••• (Server Default)' : ''),
        } : {
          enabled: true,
          model: 'gemini-3.5-flash-lite',
          autoAnalyzeTrades: true,
          autoApplyTradeDetails: false,
          hasGeminiApiKey: Boolean(config.geminiApiKey),
          geminiApiKey: config.geminiApiKey ? '•••••••• (Server Default)' : '',
        },
      },
    });
  });

  // Update profile / base currency / theme / defaultAccountScope / riskSettings / patternDetectionSettings / liveWatcherSettings / aiSettings
  app.put('/profile', async (req: any, reply) => {
    const { name, baseCurrency, theme, defaultAccountScope, riskSettings, patternDetectionSettings, liveWatcherSettings, aiSettings } = req.body;

    const update: any = {};
    const unset: any = {};
    if (name) update.name = name;
    if (baseCurrency) update.baseCurrency = baseCurrency;
    if (theme) update.theme = theme;
    if (defaultAccountScope !== undefined) update.defaultAccountScope = String(defaultAccountScope).trim() || 'ALL';

    if (riskSettings && typeof riskSettings === 'object') {
      if (riskSettings.maxDailyLoss !== undefined) update['riskSettings.maxDailyLoss'] = Number(riskSettings.maxDailyLoss);
      if (riskSettings.maxDailyTrades !== undefined) update['riskSettings.maxDailyTrades'] = Number(riskSettings.maxDailyTrades);
      if (riskSettings.maxOpenTrades !== undefined) update['riskSettings.maxOpenTrades'] = Number(riskSettings.maxOpenTrades);
      if (riskSettings.maxRiskPerTradePercent !== undefined) update['riskSettings.maxRiskPerTradePercent'] = Number(riskSettings.maxRiskPerTradePercent);
      if (riskSettings.revengeTradingMinutes !== undefined) update['riskSettings.revengeTradingMinutes'] = Number(riskSettings.revengeTradingMinutes);
    }

    if (patternDetectionSettings && typeof patternDetectionSettings === 'object') {
      if (patternDetectionSettings.defaultHtf !== undefined) update['patternDetectionSettings.defaultHtf'] = patternDetectionSettings.defaultHtf;
      if (patternDetectionSettings.defaultLtf !== undefined) update['patternDetectionSettings.defaultLtf'] = patternDetectionSettings.defaultLtf;
      if (patternDetectionSettings.autoDetectOnImport !== undefined) update['patternDetectionSettings.autoDetectOnImport'] = Boolean(patternDetectionSettings.autoDetectOnImport);
      if (patternDetectionSettings.autoDetectMistakes !== undefined) update['patternDetectionSettings.autoDetectMistakes'] = Boolean(patternDetectionSettings.autoDetectMistakes);
      if (Array.isArray(patternDetectionSettings.instrumentOverrides)) {
        update['patternDetectionSettings.instrumentOverrides'] = patternDetectionSettings.instrumentOverrides
          .map((item: any) => ({
            symbol: String(item.symbol || '').toUpperCase().trim(),
            htf: String(item.htf || '240'),
            ltf: String(item.ltf || '5'),
            preferredStrategyId: item.preferredStrategyId ? String(item.preferredStrategyId) : undefined,
            preferredStrategyName: item.preferredStrategyName ? String(item.preferredStrategyName) : undefined,
          }))
          .filter((item: any) => item.symbol.length > 0);
      }
    }

    if (liveWatcherSettings && typeof liveWatcherSettings === 'object') {
      // 1. Boolean flags
      const booleanKeys = [
        'defaultAutoExecute',
        't2Enabled',
        'isFreeRunner',
        'dynamicTrailingEnabled',
        'givebackAutoExitEnabled',
        'misSquareOffEnabled',
        'scalperHotkeysEnabled',
        'soundAlertsEnabled',
        'paperExecutionMode',
        'serverSideExecutionEnabled',
        'spreadSurgeProtectionEnabled',
        'antiLoopProtectionEnabled',
        'hardDisciplineLockoutEnabled',
        'requireHoldToConfirm',
        'telegramAttachLiveChart',
        'restrictTelegramTradeExecution',
        'enforceTelegramOrderGuardrails',
        'enforceAdaptiveDayRiskGuardrails',
        'openingBellFreezeEnabled',
        'macroNewsLockoutEnabled',
        'scaleInEnabled',
        'telegramNotifyOnAutoExecution',
      ] as const;

      for (const k of booleanKeys) {
        if (liveWatcherSettings[k] !== undefined) {
          update[`liveWatcherSettings.${k}`] = Boolean(liveWatcherSettings[k]);
        }
      }

      // 2. Numeric parameters
      const numberKeys = [
        't1MultipleR',
        't1ExitRatio',
        't1TrailPoints',
        't2MultipleR',
        't2ExitRatio',
        't2TrailPoints',
        't3MultipleR',
        'dynamicTriggerR',
        'dynamicStepR',
        'dynamicTrailPoints',
        'givebackMinPeakR',
        'givebackMaxPercent',
        'defaultRefreshIntervalSec',
        'maxSlippagePercent',
        'maxSlippagePoints',
        'spreadSurgeMultiplier',
        'orderRateLimitPer5Sec',
        'beCushionTicks',
        'slippageGuardPercent',
        'snoozeDefaultMin',
        'hardDisciplineLockoutDurationMins',
        'staleDataThresholdSeconds',
        'goldNewsReminderMinutes',
        'openingBellFreezeMinutes',
        'scaleInTriggerR',
        'scaleInSizePercent',
      ] as const;

      for (const k of numberKeys) {
        if (liveWatcherSettings[k] !== undefined) {
          update[`liveWatcherSettings.${k}`] = Number(liveWatcherSettings[k]);
        }
      }

      // 3. String configurations
      const stringKeys = [
        'defaultTargetMode',
        'executionAlgorithm',
        'targetDistributionMode',
        'assetProfile',
        'scaleInCondition',
        't1TrailingAction',
        't2TrailingAction',
        'dynamicTrailType',
        'misSquareOffTime',
        'cardDensity',
        'sortMode',
        'ladderViewMode',
        'activePresetId',
        'telegramChartTimeframe',
        'goldNewsImpactFilter',
      ] as const;

      for (const k of stringKeys) {
        if (liveWatcherSettings[k] !== undefined) {
          update[`liveWatcherSettings.${k}`] = liveWatcherSettings[k];
        }
      }

      // 4. Arrays and objects
      if (Array.isArray(liveWatcherSettings.goldNewsLeadTimesMinutes)) {
        update['liveWatcherSettings.goldNewsLeadTimesMinutes'] = liveWatcherSettings.goldNewsLeadTimesMinutes
          .map((v: any) => Number(v))
          .filter((n: number) => Number.isFinite(n) && n > 0);
      }
      if (Array.isArray(liveWatcherSettings.layoutPresets)) {
        update['liveWatcherSettings.layoutPresets'] = liveWatcherSettings.layoutPresets;
      }
      if (liveWatcherSettings.quietHours !== undefined) {
        update['liveWatcherSettings.quietHours'] = liveWatcherSettings.quietHours;
      }
      if (liveWatcherSettings.telegramAlertPolicies !== undefined) {
        update['liveWatcherSettings.telegramAlertPolicies'] = liveWatcherSettings.telegramAlertPolicies;
      }
      if (liveWatcherSettings.telegramAlertEvents && typeof liveWatcherSettings.telegramAlertEvents === 'object') {
        for (const [evtKey, evtVal] of Object.entries(liveWatcherSettings.telegramAlertEvents)) {
          update[`liveWatcherSettings.telegramAlertEvents.${evtKey}`] = Boolean(evtVal);
        }
      }
      if (liveWatcherSettings.displaySettings && typeof liveWatcherSettings.displaySettings === 'object') {
        for (const [dispKey, dispVal] of Object.entries(liveWatcherSettings.displaySettings)) {
          if (dispVal !== undefined) {
            update[`liveWatcherSettings.displaySettings.${dispKey}`] = Boolean(dispVal);
          }
        }
      }

      // Telegram Forex Presets (Gold XAUUSD & Ethereum ETHUSD)
      if (liveWatcherSettings.telegramForexPresets && typeof liveWatcherSettings.telegramForexPresets === 'object') {
        const p = liveWatcherSettings.telegramForexPresets;
        if (p.goldDefaultLot !== undefined) update['liveWatcherSettings.telegramForexPresets.goldDefaultLot'] = Number(p.goldDefaultLot);
        if (p.goldSlPoints !== undefined) update['liveWatcherSettings.telegramForexPresets.goldSlPoints'] = Number(p.goldSlPoints);
        if (p.goldRrRatio !== undefined) update['liveWatcherSettings.telegramForexPresets.goldRrRatio'] = Number(p.goldRrRatio);
        if (p.ethDefaultLot !== undefined) update['liveWatcherSettings.telegramForexPresets.ethDefaultLot'] = Number(p.ethDefaultLot);
        if (p.ethSlPrice !== undefined) update['liveWatcherSettings.telegramForexPresets.ethSlPrice'] = Number(p.ethSlPrice);
        if (p.ethRrRatio !== undefined) update['liveWatcherSettings.telegramForexPresets.ethRrRatio'] = Number(p.ethRrRatio);
        if (p.defaultDollarRisk !== undefined) update['liveWatcherSettings.telegramForexPresets.defaultDollarRisk'] = Number(p.defaultDollarRisk);
      }

      if (liveWatcherSettings.telegramPinnedCockpitMessageId !== undefined) {
        update['liveWatcherSettings.telegramPinnedCockpitMessageId'] = Number(liveWatcherSettings.telegramPinnedCockpitMessageId);
      }
      if (liveWatcherSettings.telegramPinnedCockpitChatId !== undefined) {
        update['liveWatcherSettings.telegramPinnedCockpitChatId'] = liveWatcherSettings.telegramPinnedCockpitChatId;
      }

      // 5. Telegram Alerts Enabled Flag
      if (liveWatcherSettings.telegramAlertsEnabled !== undefined) {
        update['liveWatcherSettings.telegramAlertsEnabled'] = Boolean(liveWatcherSettings.telegramAlertsEnabled);
      }

      // 6. Telegram Chat ID (Never wiped on partial updates or empty string unless explicit disconnect requested)
      if (liveWatcherSettings.telegramChatId !== undefined) {
        const rawChatId = String(liveWatcherSettings.telegramChatId).trim();
        if (rawChatId !== '') {
          update['liveWatcherSettings.telegramChatId'] = rawChatId;
        } else if (liveWatcherSettings.clearTelegramCredentials === true) {
          unset['liveWatcherSettings.telegramChatId'] = 1;
        }
      }

      // 7. Telegram Bot Token (Masked values and partial payloads never overwrite real encrypted token)
      if (liveWatcherSettings.telegramBotToken !== undefined) {
        const rawToken = String(liveWatcherSettings.telegramBotToken).trim();
        if (rawToken.startsWith('••') || rawToken.startsWith('**')) {
          // Masked value sent from UI: PRESERVE existing encrypted token in database
        } else if (rawToken === '' || rawToken === '__CLEAR__') {
          if (liveWatcherSettings.clearTelegramCredentials === true || rawToken === '__CLEAR__') {
            unset['liveWatcherSettings.telegramBotToken'] = 1;
            unset['liveWatcherSettings.telegramChatId'] = 1;
            update['liveWatcherSettings.telegramAlertsEnabled'] = false;
          }
          // If empty string without explicit disconnect, PRESERVE existing token
        } else {
          // Fresh token entered: encrypt using AES-256-GCM and store
          const encrypted = encryptSecret(rawToken);
          if (encrypted) {
            update['liveWatcherSettings.telegramBotToken'] = encrypted;
          }
        }
      } else if (liveWatcherSettings.clearTelegramCredentials === true) {
        unset['liveWatcherSettings.telegramBotToken'] = 1;
        unset['liveWatcherSettings.telegramChatId'] = 1;
        update['liveWatcherSettings.telegramAlertsEnabled'] = false;
      }
    }

    if (aiSettings && typeof aiSettings === 'object') {
      if (aiSettings.enabled !== undefined) update['aiSettings.enabled'] = Boolean(aiSettings.enabled);
      if (aiSettings.model !== undefined) update['aiSettings.model'] = String(aiSettings.model).trim();
      if (aiSettings.autoAnalyzeTrades !== undefined) update['aiSettings.autoAnalyzeTrades'] = Boolean(aiSettings.autoAnalyzeTrades);
      if (aiSettings.autoApplyTradeDetails !== undefined) update['aiSettings.autoApplyTradeDetails'] = Boolean(aiSettings.autoApplyTradeDetails);
      if (aiSettings.clearGeminiApiKey === true) {
        update['aiSettings.geminiApiKey'] = '';
      } else if (aiSettings.geminiApiKey !== undefined) {
        const rawKey = String(aiSettings.geminiApiKey).trim();
        if (rawKey && !rawKey.startsWith('••') && !rawKey.startsWith('**')) {
          const enc = encryptSecret(rawKey);
          if (enc) {
            update['aiSettings.geminiApiKey'] = enc;
          }
        }
      }
    }

    const mongoUpdate: any = {};
    if (Object.keys(update).length > 0) mongoUpdate.$set = update;
    if (Object.keys(unset).length > 0) mongoUpdate.$unset = unset;

    const user = await User.findByIdAndUpdate(req.user!.id, mongoUpdate, { new: true });

    // Synchronize background long-polling for Telegram bot updates
    if (user?.liveWatcherSettings?.telegramBotToken) {
      const activeBotToken = safeDecryptSecret(user.liveWatcherSettings.telegramBotToken);
      if (activeBotToken) {
        TelegramPollingService.startPollingForBot(activeBotToken);
      }
    } else if (liveWatcherSettings?.clearTelegramCredentials === true) {
      // Telegram disconnected: stop polling
      TelegramPollingService.stop();
      TelegramPollingService.start();
    } else {
      // If token was cleared/unset, stop polling
      TelegramPollingService.stop();
    }

    return reply.send({
      success: true,
      data: {
        id: user!._id.toString(),
        name: user!.name,
        email: user!.email,
        baseCurrency: user!.baseCurrency,
        theme: user!.theme,
        defaultAccountScope: user!.defaultAccountScope || 'ALL',
        riskSettings: user!.riskSettings,
        patternDetectionSettings: user!.patternDetectionSettings || DEFAULT_PATTERN_DETECTION_SETTINGS,
        liveWatcherSettings: maskLiveWatcherSettings(user!.liveWatcherSettings),
        aiSettings: user!.aiSettings ? {
          enabled: user!.aiSettings.enabled ?? true,
          model: user!.aiSettings.model || 'gemini-3.5-flash-lite',
          autoAnalyzeTrades: user!.aiSettings.autoAnalyzeTrades ?? true,
          autoApplyTradeDetails: user!.aiSettings.autoApplyTradeDetails ?? false,
          hasGeminiApiKey: Boolean(user!.aiSettings.geminiApiKey || config.geminiApiKey),
          geminiApiKey: user!.aiSettings.geminiApiKey ? '••••••••' : (config.geminiApiKey ? '•••••••• (Server Default)' : ''),
        } : {
          enabled: true,
          model: 'gemini-3.5-flash-lite',
          autoAnalyzeTrades: true,
          autoApplyTradeDetails: false,
          hasGeminiApiKey: Boolean(config.geminiApiKey),
          geminiApiKey: config.geminiApiKey ? '•••••••• (Server Default)' : '',
        },
      },
    });
  });

  // Change password
  app.post('/change-password', async (req: any, reply) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: 'New password must be at least 8 characters' },
      });
    }

    const user = await User.findById(req.user!.id);
    if (!user) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return reply.status(401).send({
        success: false,
        error: { code: 'INCORRECT_PASSWORD', message: 'Current password is incorrect' },
      });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    // Revoke all other active sessions for this user on password change
    if (req.sessionId) {
      await Session.deleteMany({
        userId: req.user!.id,
        _id: { $ne: req.sessionId },
      });
    }

    return reply.send({ success: true, message: 'Password updated successfully' });
  });

  // Test Telegram Push Alert Connection
  app.post('/test-telegram', async (req: any, reply) => {
    let { botToken, chatId } = req.body || {};
    const user = await User.findById(req.user!.id);

    if ((!botToken || botToken.startsWith('••') || botToken.startsWith('**')) && user?.liveWatcherSettings?.telegramBotToken) {
      try {
        botToken = decryptSecret(user.liveWatcherSettings.telegramBotToken) || user.liveWatcherSettings.telegramBotToken;
      } catch (err: any) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'TELEGRAM_FAILED',
            message: 'Unable to decrypt stored Telegram Bot Token (encryption key mismatch). Please re-enter your Bot Token and save settings.',
          },
        });
      }
    }
    if (!chatId && user?.liveWatcherSettings?.telegramChatId) {
      chatId = user.liveWatcherSettings.telegramChatId;
    }

    if (!botToken || !chatId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'botToken and chatId are required' },
      });
    }

    const res = await TelegramAlertService.testConnection(botToken, chatId);
    if (!res.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'TELEGRAM_FAILED', message: res.message },
      });
    }

    // Auto-save the verified botToken and chatId immediately so callbacks and buttons can resolve the user
    if (user) {
      const encrypted = encryptSecret(botToken);
      await User.findByIdAndUpdate(user._id, {
        $set: {
          'liveWatcherSettings.telegramBotToken': encrypted,
          'liveWatcherSettings.telegramChatId': String(chatId).trim(),
          'liveWatcherSettings.telegramAlertsEnabled': true,
        },
      });
    }

    // Start long-polling listener so interactive buttons respond immediately without requiring a public HTTPS webhook
    TelegramPollingService.startPollingForBot(botToken);

    return reply.send({ success: true, message: res.message, saved: true });
  });

  // Test Google Gemini API Key Connection
  app.post('/test-gemini', async (req: any, reply) => {
    let { apiKey } = req.body || {};
    const user = await User.findById(req.user!.id);

    // If key not provided or masked, check user's stored encrypted key
    if ((!apiKey || apiKey.startsWith('••') || apiKey.startsWith('**')) && user?.aiSettings?.geminiApiKey) {
      const decrypted = safeDecryptSecret(user.aiSettings.geminiApiKey);
      if (decrypted) {
        apiKey = decrypted;
      } else if (!user.aiSettings.geminiApiKey.startsWith('enc:')) {
        apiKey = user.aiSettings.geminiApiKey;
      } else {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'GEMINI_DECRYPT_FAILED',
            message: 'Unable to decrypt stored Gemini API Key (encryption key rotated). Please paste your API key and click Save Settings.',
          },
        });
      }
    }

    if (!apiKey && config.geminiApiKey) {
      apiKey = config.geminiApiKey;
    }

    if (!apiKey) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'NO_API_KEY',
          message: 'No Google Gemini API key provided. Please enter your API key from Google AI Studio.',
        },
      });
    }

    const candidateModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
      'gemini-flash-latest',
      'gemini-2.5-flash',
    ];

    let lastError = 'Unable to establish connection with Google Gemini API';
    let verifiedModel: string | null = null;
    let latencyMs = 0;

    for (const model of candidateModels) {
      const startTime = Date.now();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: 'Respond with exactly: OK' }],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 10,
            },
          }),
        });

        clearTimeout(timeout);
        latencyMs = Date.now() - startTime;

        if (response.ok) {
          const resJson: any = await response.json();
          const text = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            verifiedModel = model;
            break;
          }
        } else {
          const errJson: any = await response.json().catch(() => null);
          const errMsg = errJson?.error?.message || response.statusText || `HTTP ${response.status}`;
          lastError = `Google API (${model}): ${errMsg}`;
          // If key is invalid (400 or 401 API key not valid), stop trying further models
          if (
            (response.status === 400 || response.status === 401 || response.status === 403) &&
            errMsg.toLowerCase().includes('api key not valid')
          ) {
            break;
          }
        }
      } catch (err: any) {
        clearTimeout(timeout);
        lastError = err?.message || 'Connection timeout or network failure';
      }
    }

    if (!verifiedModel) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'GEMINI_TEST_FAILED',
          message: lastError,
        },
      });
    }

    // Auto-save verified key if provided directly
    if (user && req.body?.apiKey && !req.body.apiKey.startsWith('••') && !req.body.apiKey.startsWith('**')) {
      const encrypted = encryptSecret(apiKey.trim());
      if (encrypted) {
        await User.findByIdAndUpdate(user._id, {
          $set: {
            'aiSettings.geminiApiKey': encrypted,
            'aiSettings.enabled': true,
            'aiSettings.model': verifiedModel,
          },
        });
      }
    }

    return reply.send({
      success: true,
      data: {
        status: 'CONNECTED',
        model: verifiedModel,
        latencyMs,
        message: `Connected successfully to Google Gemini (${verifiedModel}) in ${latencyMs}ms.`,
      },
    });
  });

  // Test Telegram Gold (XAUUSD) News Reminder Alert
  app.post('/test-gold-news-alert', async (req: any, reply) => {
    const user = await User.findById(req.user!.id);
    if (!user) {
      return reply.status(404).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }

    const settings = user.liveWatcherSettings;
    const rawToken = settings?.telegramBotToken;
    const botToken = rawToken ? safeDecryptSecret(rawToken) || (rawToken.startsWith('enc:') ? null : rawToken) : null;
    const chatId = settings?.telegramChatId;

    if (!botToken || !chatId) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'TELEGRAM_NOT_CONFIGURED',
          message: 'Please connect your Telegram bot and enter your Chat ID in Settings first.',
        },
      });
    }

    const upcoming = await EconomicCalendarService.getUpcomingGoldNews(new Date(), 48);
    const event = upcoming[0] || {
      id: 'SAMPLE_GOLD_CPI',
      title: 'US Core CPI m/m & y/y (Consumer Price Index)',
      country: 'USD',
      impact: 'HIGH' as const,
      isGoldMover: true,
      timestamp: new Date(Date.now() + 15 * 60000).toISOString(),
      istTimeStr: 'Today 18:00 IST',
      countdownStr: 'in 15m',
      minutesUntil: 15,
      forecast: '0.3%',
      previous: '0.3%',
      status: 'IMMINENT' as const,
      goldImpactNote: 'Directly influences Fed interest rate expectations. Stronger inflation bolsters USD and yields, pressuring Gold (XAUUSD) downward.',
      goldBias: 'BULLISH_IF_LOW' as const,
      recommendedAction: 'Protect open XAUUSD positions. Expect extreme volatility and widened spreads ±5m around release.',
    };

    const leadTime = settings?.goldNewsReminderMinutes || 15;
    const success = await TelegramAlertService.sendGoldNewsReminder(user, event, leadTime);

    if (!success) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'DISPATCH_FAILED',
          message: 'Failed to send Gold news alert to Telegram. Verify your bot token and chat ID.',
        },
      });
    }

    return reply.send({
      success: true,
      message: `Test Gold news reminder sent to Telegram (${event.title} • ${leadTime}m reminder)!`,
    });
  });

  // Test Telegram Gold (XAUUSD) Post-News Actual Result Flash
  app.post('/test-gold-news-result-alert', async (req: any, reply) => {
    const user = await User.findById(req.user!.id);
    if (!user) {
      return reply.status(404).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }

    const settings = user.liveWatcherSettings;
    const rawToken = settings?.telegramBotToken;
    const botToken = rawToken ? safeDecryptSecret(rawToken) || (rawToken.startsWith('enc:') ? null : rawToken) : null;
    const chatId = settings?.telegramChatId;

    if (!botToken || !chatId) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'TELEGRAM_NOT_CONFIGURED',
          message: 'Please connect your Telegram bot and enter your Chat ID in Settings first.',
        },
      });
    }

    const upcoming = await EconomicCalendarService.getUpcomingGoldNews(new Date(), 48);
    const event = upcoming[0] || {
      id: 'SAMPLE_GOLD_PPI',
      title: 'US Core PPI m/m (Producer Price Index)',
      country: 'USD',
      impact: 'HIGH' as const,
      isGoldMover: true,
      timestamp: new Date().toISOString(),
      istTimeStr: 'Today 19:00 IST',
      countdownStr: 'JUST RELEASED',
      minutesUntil: 0,
      forecast: '0.4%',
      previous: '0.7%',
      actual: '0.3%',
      actualNum: 0.3,
      deviation: '-0.1',
      deviationDirection: 'MISS' as const,
      actualBiasOutcome: 'BULLISH' as const,
      actualSummaryNote: 'Softer inflation cools Treasury yields, triggering upside momentum for non-yielding Gold (XAUUSD).',
      status: 'JUST_RELEASED' as const,
      goldImpactNote: 'Directly influences Fed interest rate trajectory. Softer inflation sparks rate-cut rallies in Gold.',
      goldBias: 'BULLISH_IF_LOW' as const,
      recommendedAction: 'Watch for initial spread normalization before entering pullback continuations.',
    };

    const mockEvent = {
      ...event,
      actual: event.actual || '0.3%',
      actualNum: event.actualNum ?? 0.3,
      deviation: event.deviation || '-0.1',
      deviationDirection: event.deviationDirection || ('MISS' as const),
      actualBiasOutcome: event.actualBiasOutcome || ('BULLISH' as const),
      actualSummaryNote:
        event.actualSummaryNote ||
        'Softer inflation cools Treasury yields, triggering upside momentum for non-yielding Gold (XAUUSD).',
    };

    const success = await TelegramAlertService.sendGoldNewsResultAlert(user, mockEvent);

    if (!success) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'DISPATCH_FAILED',
          message: 'Failed to send Gold news result alert to Telegram. Verify your bot token and chat ID.',
        },
      });
    }

    return reply.send({
      success: true,
      message: `Test Gold news result flash sent to Telegram (${mockEvent.title} • Actual: ${mockEvent.actual})!`,
    });
  });

  // Test Telegram Market Session Transition Alert
  app.post('/test-session-alert', async (req: any, reply) => {
    const user = await User.findById(req.user!.id);
    if (!user) {
      return reply.status(404).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }

    const settings = user.liveWatcherSettings;
    const rawToken = settings?.telegramBotToken;
    const botToken = rawToken ? safeDecryptSecret(rawToken) || (rawToken.startsWith('enc:') ? null : rawToken) : null;
    const chatId = settings?.telegramChatId;

    if (!botToken || !chatId) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'TELEGRAM_NOT_CONFIGURED',
          message: 'Please connect your Telegram bot and enter your Chat ID in Settings first.',
        },
      });
    }

    const sessionName = '🇬🇧 London Open (08:00 UTC / 13:30 IST)';
    const description = 'Major European liquidity injection. Watch for breakout expansions, institutional retests, and initial direction setting.';
    const keyFocus = 'High volume surge; false breakout traps common at session open.';

    await TelegramAlertService.sendGoldSessionAlert(user, sessionName, description, keyFocus);

    return reply.send({
      success: true,
      message: 'Test market session transition notification sent to your Telegram!',
    });
  });

  // Register Telegram Webhook URL for interactive buttons and two-way commands
  app.post('/register-telegram-webhook', async (req: any, reply) => {
    let { botToken, webhookUrl } = req.body || {};
    const user = await User.findById(req.user!.id);

    if ((!botToken || botToken.startsWith('••') || botToken.startsWith('**')) && user?.liveWatcherSettings?.telegramBotToken) {
      try {
        botToken = decryptSecret(user.liveWatcherSettings.telegramBotToken) || user.liveWatcherSettings.telegramBotToken;
      } catch (err: any) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'TELEGRAM_FAILED',
            message: 'Unable to decrypt stored Telegram Bot Token (encryption key mismatch). Please re-enter your Bot Token and save settings.',
          },
        });
      }
    }

    if (!botToken || !webhookUrl) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_PARAMS', message: 'botToken and webhookUrl are required' },
      });
    }

    const res = await TelegramAlertService.setWebhook(botToken, webhookUrl);
    if (!res.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'WEBHOOK_FAILED', message: res.message },
      });
    }

    // Since webhook is successfully registered with Telegram, pause local long polling
    TelegramPollingService.stopPollingForBot(botToken);

    return reply.send({ success: true, message: res.message });
  });

  // Send sample formatted terminal alert to Telegram
  app.post('/sample-alert', async (req: any, reply) => {
    const user = await User.findById(req.user!.id);
    const settings = user?.liveWatcherSettings;
    const botToken = settings?.telegramBotToken ? safeDecryptSecret(settings.telegramBotToken) : null;
    const chatId = settings?.telegramChatId;

    if (!botToken || !chatId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NOT_CONFIGURED', message: 'Telegram Bot Token and Chat ID must be saved first' },
      });
    }

    const sampleTrade = {
      _id: new mongoose.Types.ObjectId(),
      symbol: 'NIFTY 24500 CE',
      direction: 'LONG',
      entryPrice: 122.30,
      quantity: 50,
      contractMultiplier: 1,
      assetClass: 'OPTIONS',
      risk: {
        initialStopLoss: 118.00,
        currentStopLoss: 118.00,
        plannedTarget: 130.00,
      },
      calculated: {
        liveMfeSummary: { peakUnrealizedR: 0.40, peakTimestamp: new Date(Date.now() - 11 * 60000) },
        trueBreakevenPrice: 122.95,
      },
    };

    const sent = await TelegramAlertService.dispatchRiskAlert(user, sampleTrade, {
      type: 'STOP_THREAT',
      severity: 2, // CRITICAL
      metricValue: 24, // 24% runway remaining
      ltp: 121.40,
    });

    return reply.send({
      success: sent,
      message: sent ? 'Sample CRITICAL terminal card alert dispatched to Telegram!' : 'Sample alert suppressed or delivery failed',
    });
  });

  // Get system statistics for settings overview
  app.get('/system-status', async (req, reply) => {
    const tradeCount = await Trade.countDocuments({ userId: req.user!.id });
    const accountCount = await TradingAccount.countDocuments({ userId: req.user!.id });
    const attachmentCount = await Attachment.countDocuments({ userId: req.user!.id });
    const backup = await BackupStatusService.getStatus();

    return reply.send({
      success: true,
      data: {
        tradeCount,
        accountCount,
        attachmentCount,
        database: 'MongoDB Atlas Dedicated Cloud Cluster',
        privacyMode: '100% Private Cloud (Dedicated Atlas + Cloudflare R2)',
        appVersion: '1.0.0',
        backup,
      },
    });
  });

  // Trigger an immediate off-site encrypted cloud backup
  app.post('/run-backup', async (_req, reply) => {
    const candidates = [
      path.resolve(process.cwd(), 'scripts/backup-scheduled.js'),
      path.resolve(process.cwd(), '../../scripts/backup-scheduled.js'),
    ];
    const scriptPath = candidates.find((p) => fs.existsSync(p));
    if (!scriptPath) {
      return reply.status(500).send({
        success: false,
        error: { code: 'BACKUP_SCRIPT_NOT_FOUND', message: 'Could not locate scripts/backup-scheduled.js' },
      });
    }

    try {
      await execFileAsync(process.execPath, [scriptPath], {
        cwd: path.dirname(path.dirname(scriptPath)),
        timeout: 300_000,
      });
      BackupStatusService.resetCache();
      const backup = await BackupStatusService.getStatus();
      return reply.send({
        success: true,
        data: { backup },
      });
    } catch (err: any) {
      BackupStatusService.resetCache();
      const backup = await BackupStatusService.getStatus();
      return reply.status(500).send({
        success: false,
        error: {
          code: 'BACKUP_EXECUTION_FAILED',
          message: backup?.error || err.message || 'Off-site backup execution failed',
        },
        data: { backup },
      });
    }
  });
};
