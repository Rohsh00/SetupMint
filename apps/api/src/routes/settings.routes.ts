import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { DEFAULT_PATTERN_DETECTION_SETTINGS } from '@tradevault/shared';
import { User, Trade, TradingAccount, Attachment, Session } from '../db/models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { BackupStatusService } from '../services/backup-status.service.js';

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
      },
    });
  });

  // Update profile / base currency / theme / riskSettings / patternDetectionSettings
  app.put('/profile', async (req: any, reply) => {
    const { name, baseCurrency, theme, riskSettings, patternDetectionSettings } = req.body;

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
