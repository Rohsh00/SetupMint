import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { DEFAULT_PATTERN_DETECTION_SETTINGS, DEFAULT_LIVE_WATCHER_SETTINGS } from '@tradevault/shared';
import { User, Trade, TradingAccount, Attachment, Session } from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { BackupStatusService } from '../services/backup-status.service.js';
import { TelegramAlertService } from '../services/telegram-alert.service.js';

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
        riskSettings: user.riskSettings,
        patternDetectionSettings: user.patternDetectionSettings || DEFAULT_PATTERN_DETECTION_SETTINGS,
        liveWatcherSettings: user.liveWatcherSettings || DEFAULT_LIVE_WATCHER_SETTINGS,
      },
    });
  });

  // Update profile / base currency / theme / riskSettings / patternDetectionSettings / liveWatcherSettings
  app.put('/profile', async (req: any, reply) => {
    const { name, baseCurrency, theme, riskSettings, patternDetectionSettings, liveWatcherSettings } = req.body;

    const update: any = {};
    if (name) update.name = name;
    if (baseCurrency) update.baseCurrency = baseCurrency;
    if (theme) update.theme = theme;
    if (riskSettings) {
      update.riskSettings = {
        maxDailyLoss: riskSettings.maxDailyLoss !== undefined ? Number(riskSettings.maxDailyLoss) : undefined,
        maxDailyTrades: riskSettings.maxDailyTrades !== undefined ? Number(riskSettings.maxDailyTrades) : undefined,
        maxOpenTrades: riskSettings.maxOpenTrades !== undefined ? Number(riskSettings.maxOpenTrades) : undefined,
        maxRiskPerTradePercent: riskSettings.maxRiskPerTradePercent !== undefined ? Number(riskSettings.maxRiskPerTradePercent) : undefined,
        revengeTradingMinutes: riskSettings.revengeTradingMinutes !== undefined ? Number(riskSettings.revengeTradingMinutes) : undefined,
      };
    }
    if (patternDetectionSettings) {
      update.patternDetectionSettings = {
        defaultHtf: patternDetectionSettings.defaultHtf || '240',
        defaultLtf: patternDetectionSettings.defaultLtf || '5',
        autoDetectOnImport: patternDetectionSettings.autoDetectOnImport !== undefined ? Boolean(patternDetectionSettings.autoDetectOnImport) : true,
        autoDetectMistakes: patternDetectionSettings.autoDetectMistakes !== undefined ? Boolean(patternDetectionSettings.autoDetectMistakes) : true,
        instrumentOverrides: Array.isArray(patternDetectionSettings.instrumentOverrides)
          ? patternDetectionSettings.instrumentOverrides
              .map((item: any) => ({
                symbol: String(item.symbol || '').toUpperCase().trim(),
                htf: String(item.htf || '240'),
                ltf: String(item.ltf || '5'),
                preferredStrategyId: item.preferredStrategyId ? String(item.preferredStrategyId) : undefined,
                preferredStrategyName: item.preferredStrategyName ? String(item.preferredStrategyName) : undefined,
              }))
              .filter((item: any) => item.symbol.length > 0)
          : [],
      };
    }
    if (liveWatcherSettings) {
      update.liveWatcherSettings = {
        defaultAutoExecute: liveWatcherSettings.defaultAutoExecute !== undefined ? Boolean(liveWatcherSettings.defaultAutoExecute) : DEFAULT_LIVE_WATCHER_SETTINGS.defaultAutoExecute,
        defaultTargetMode: liveWatcherSettings.defaultTargetMode || DEFAULT_LIVE_WATCHER_SETTINGS.defaultTargetMode,
        t1MultipleR: liveWatcherSettings.t1MultipleR !== undefined ? Number(liveWatcherSettings.t1MultipleR) : DEFAULT_LIVE_WATCHER_SETTINGS.t1MultipleR,
        t1ExitRatio: liveWatcherSettings.t1ExitRatio !== undefined ? Number(liveWatcherSettings.t1ExitRatio) : DEFAULT_LIVE_WATCHER_SETTINGS.t1ExitRatio,
        t1TrailingAction: liveWatcherSettings.t1TrailingAction || DEFAULT_LIVE_WATCHER_SETTINGS.t1TrailingAction,
        t1TrailPoints: liveWatcherSettings.t1TrailPoints !== undefined ? Number(liveWatcherSettings.t1TrailPoints) : DEFAULT_LIVE_WATCHER_SETTINGS.t1TrailPoints,
        t2Enabled: liveWatcherSettings.t2Enabled !== undefined ? Boolean(liveWatcherSettings.t2Enabled) : DEFAULT_LIVE_WATCHER_SETTINGS.t2Enabled,
        t2MultipleR: liveWatcherSettings.t2MultipleR !== undefined ? Number(liveWatcherSettings.t2MultipleR) : DEFAULT_LIVE_WATCHER_SETTINGS.t2MultipleR,
        t2ExitRatio: liveWatcherSettings.t2ExitRatio !== undefined ? Number(liveWatcherSettings.t2ExitRatio) : DEFAULT_LIVE_WATCHER_SETTINGS.t2ExitRatio,
        t2TrailingAction: liveWatcherSettings.t2TrailingAction || DEFAULT_LIVE_WATCHER_SETTINGS.t2TrailingAction,
        t2TrailPoints: liveWatcherSettings.t2TrailPoints !== undefined ? Number(liveWatcherSettings.t2TrailPoints) : DEFAULT_LIVE_WATCHER_SETTINGS.t2TrailPoints,
        isFreeRunner: liveWatcherSettings.isFreeRunner !== undefined ? Boolean(liveWatcherSettings.isFreeRunner) : DEFAULT_LIVE_WATCHER_SETTINGS.isFreeRunner,
        t3MultipleR: liveWatcherSettings.t3MultipleR !== undefined ? Number(liveWatcherSettings.t3MultipleR) : DEFAULT_LIVE_WATCHER_SETTINGS.t3MultipleR,
        dynamicTrailingEnabled: liveWatcherSettings.dynamicTrailingEnabled !== undefined ? Boolean(liveWatcherSettings.dynamicTrailingEnabled) : DEFAULT_LIVE_WATCHER_SETTINGS.dynamicTrailingEnabled,
        dynamicTriggerR: liveWatcherSettings.dynamicTriggerR !== undefined ? Number(liveWatcherSettings.dynamicTriggerR) : DEFAULT_LIVE_WATCHER_SETTINGS.dynamicTriggerR,
        dynamicTrailType: liveWatcherSettings.dynamicTrailType || DEFAULT_LIVE_WATCHER_SETTINGS.dynamicTrailType,
        dynamicStepR: liveWatcherSettings.dynamicStepR !== undefined ? Number(liveWatcherSettings.dynamicStepR) : DEFAULT_LIVE_WATCHER_SETTINGS.dynamicStepR,
        dynamicTrailPoints: liveWatcherSettings.dynamicTrailPoints !== undefined ? Number(liveWatcherSettings.dynamicTrailPoints) : DEFAULT_LIVE_WATCHER_SETTINGS.dynamicTrailPoints,
        givebackAutoExitEnabled: liveWatcherSettings.givebackAutoExitEnabled !== undefined ? Boolean(liveWatcherSettings.givebackAutoExitEnabled) : DEFAULT_LIVE_WATCHER_SETTINGS.givebackAutoExitEnabled,
        givebackMinPeakR: liveWatcherSettings.givebackMinPeakR !== undefined ? Number(liveWatcherSettings.givebackMinPeakR) : DEFAULT_LIVE_WATCHER_SETTINGS.givebackMinPeakR,
        givebackMaxPercent: liveWatcherSettings.givebackMaxPercent !== undefined ? Number(liveWatcherSettings.givebackMaxPercent) : DEFAULT_LIVE_WATCHER_SETTINGS.givebackMaxPercent,
        misSquareOffEnabled: liveWatcherSettings.misSquareOffEnabled !== undefined ? Boolean(liveWatcherSettings.misSquareOffEnabled) : DEFAULT_LIVE_WATCHER_SETTINGS.misSquareOffEnabled,
        misSquareOffTime: liveWatcherSettings.misSquareOffTime || DEFAULT_LIVE_WATCHER_SETTINGS.misSquareOffTime,
        scalperHotkeysEnabled: liveWatcherSettings.scalperHotkeysEnabled !== undefined ? Boolean(liveWatcherSettings.scalperHotkeysEnabled) : DEFAULT_LIVE_WATCHER_SETTINGS.scalperHotkeysEnabled,
        soundAlertsEnabled: liveWatcherSettings.soundAlertsEnabled !== undefined ? Boolean(liveWatcherSettings.soundAlertsEnabled) : DEFAULT_LIVE_WATCHER_SETTINGS.soundAlertsEnabled,
        defaultRefreshIntervalSec: liveWatcherSettings.defaultRefreshIntervalSec !== undefined ? Number(liveWatcherSettings.defaultRefreshIntervalSec) : DEFAULT_LIVE_WATCHER_SETTINGS.defaultRefreshIntervalSec,
        paperExecutionMode: liveWatcherSettings.paperExecutionMode !== undefined ? Boolean(liveWatcherSettings.paperExecutionMode) : DEFAULT_LIVE_WATCHER_SETTINGS.paperExecutionMode,
        serverSideExecutionEnabled: liveWatcherSettings.serverSideExecutionEnabled !== undefined ? Boolean(liveWatcherSettings.serverSideExecutionEnabled) : DEFAULT_LIVE_WATCHER_SETTINGS.serverSideExecutionEnabled,
        telegramAlertsEnabled: liveWatcherSettings.telegramAlertsEnabled !== undefined ? Boolean(liveWatcherSettings.telegramAlertsEnabled) : DEFAULT_LIVE_WATCHER_SETTINGS.telegramAlertsEnabled,
        telegramBotToken: liveWatcherSettings.telegramBotToken !== undefined ? String(liveWatcherSettings.telegramBotToken).trim() : undefined,
        telegramChatId: liveWatcherSettings.telegramChatId !== undefined ? String(liveWatcherSettings.telegramChatId).trim() : undefined,
        telegramAlertEvents: liveWatcherSettings.telegramAlertEvents || DEFAULT_LIVE_WATCHER_SETTINGS.telegramAlertEvents,
        hardDisciplineLockoutEnabled: liveWatcherSettings.hardDisciplineLockoutEnabled !== undefined ? Boolean(liveWatcherSettings.hardDisciplineLockoutEnabled) : DEFAULT_LIVE_WATCHER_SETTINGS.hardDisciplineLockoutEnabled,
        hardDisciplineLockoutDurationMins: liveWatcherSettings.hardDisciplineLockoutDurationMins !== undefined ? Number(liveWatcherSettings.hardDisciplineLockoutDurationMins) : DEFAULT_LIVE_WATCHER_SETTINGS.hardDisciplineLockoutDurationMins,
      };
    }

    const user = await User.findByIdAndUpdate(req.user!.id, { $set: update }, { new: true });

    return reply.send({
      success: true,
      data: {
        id: user!._id.toString(),
        name: user!.name,
        email: user!.email,
        baseCurrency: user!.baseCurrency,
        theme: user!.theme,
        riskSettings: user!.riskSettings,
        patternDetectionSettings: user!.patternDetectionSettings || DEFAULT_PATTERN_DETECTION_SETTINGS,
        liveWatcherSettings: user!.liveWatcherSettings || DEFAULT_LIVE_WATCHER_SETTINGS,
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
    const { botToken, chatId } = req.body || {};
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

    return reply.send({ success: true, message: res.message });
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
};
