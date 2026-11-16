/**
 * SetupMint - In-Car & Apple CarPlay Siri Voice Routes
 *
 * Exposes plain text and structured voice briefing endpoints for:
 * 1. Live market quotes (/price)
 * 2. Active positions & portfolio telemetry (/trades)
 * 3. In-car driving actions like Breakeven or Panic (/action)
 * 4. User setup & iOS Shortcut generator (/setup)
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';
import { CarPlayService } from '../services/carplay.service.js';
import { User } from '../db/models/index.js';
import { config } from '../config.js';

export const carplayRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /**
   * Helper to resolve user from request key/token or session
   */
  async function resolveRequestUser(req: any): Promise<any> {
    const key =
      req.headers['x-carplay-token'] ||
      req.headers['x-api-key'] ||
      req.query?.key ||
      req.query?.token;

    if (key) {
      const user = await CarPlayService.resolveUser(String(key));
      if (user) return user;
    }

    if (req.user?.id) {
      return await User.findById(req.user.id);
    }

    return null;
  }

  /**
   * GET /price: Live market price voice briefing
   */
  app.get('/price', async (req: any, reply) => {
    const user = await resolveRequestUser(req);
    if (!user) {
      const msg = 'Authentication failed. Please check your CarPlay security key.';
      if (req.query?.format === 'json') {
        return reply.status(401).send({ success: false, error: msg });
      }
      return reply.status(401).type('text/plain; charset=utf-8').send(msg);
    }

    const symbol = req.query?.symbol;
    const format = req.query?.format || 'voice';

    const result = await CarPlayService.getLivePriceBriefing(user, symbol);

    if (format === 'json') {
      return reply.send(result);
    }

    return reply.type('text/plain; charset=utf-8').send(result.speechText);
  });

  /**
   * GET /trades: Live positions & PnL voice briefing
   */
  app.get('/trades', async (req: any, reply) => {
    const user = await resolveRequestUser(req);
    if (!user) {
      const msg = 'Authentication failed. Please check your CarPlay security key.';
      if (req.query?.format === 'json') {
        return reply.status(401).send({ success: false, error: msg });
      }
      return reply.status(401).type('text/plain; charset=utf-8').send(msg);
    }

    const format = req.query?.format || 'voice';
    const result = await CarPlayService.getTradesBriefing(user);

    if (format === 'json') {
      return reply.send(result);
    }

    return reply.type('text/plain; charset=utf-8').send(result.speechText);
  });

  /**
   * GET /briefing: Combined market & trade briefing
   */
  app.get('/briefing', async (req: any, reply) => {
    const user = await resolveRequestUser(req);
    if (!user) {
      const msg = 'Authentication failed. Please check your CarPlay security key.';
      return reply.status(401).type('text/plain; charset=utf-8').send(msg);
    }

    const format = req.query?.format || 'voice';
    const [priceRes, tradesRes] = await Promise.all([
      CarPlayService.getLivePriceBriefing(user, req.query?.symbol),
      CarPlayService.getTradesBriefing(user),
    ]);

    const combinedSpeech = `${priceRes.speechText} ${tradesRes.speechText}`;

    if (format === 'json') {
      return reply.send({
        success: true,
        speechText: combinedSpeech,
        price: priceRes.data,
        trades: tradesRes.data,
      });
    }

    return reply.type('text/plain; charset=utf-8').send(combinedSpeech);
  });

  /**
   * POST /action and GET /action: In-car hands-free trade control
   */
  const handleAction = async (req: any, reply: any) => {
    const user = await resolveRequestUser(req);
    if (!user) {
      const msg = 'Authentication failed. Please check your CarPlay security key.';
      if (req.query?.format === 'json' || req.body?.format === 'json') {
        return reply.status(401).send({ success: false, error: msg });
      }
      return reply.status(401).type('text/plain; charset=utf-8').send(msg);
    }

    const action = req.body?.action || req.query?.action || 'BE';
    const symbol = req.body?.symbol || req.query?.symbol;
    const format = req.body?.format || req.query?.format || 'voice';

    const result = await CarPlayService.executeInCarAction(user, action, symbol);

    if (format === 'json') {
      return reply.send(result);
    }

    return reply.type('text/plain; charset=utf-8').send(result.speechText);
  };

  app.post('/action', handleAction);
  app.get('/action', handleAction);

  /**
   * GET /setup: Authenticated user setup & Siri Shortcut link generator
   */
  app.get('/setup', { preHandler: [requireAuth] }, async (req: any, reply) => {
    const user = await User.findById(req.user?.id);
    if (!user) return reply.status(404).send({ success: false, error: 'User not found' });

    const token = await CarPlayService.getOrCreateCarPlayToken(user);
    const host = req.headers['x-forwarded-host'] || req.headers.host || '13.205.58.162';
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const baseUrl = `${proto}://${host}`;

    const endpoints = {
      goldPriceVoice: `${baseUrl}/api/v1/carplay/price?symbol=XAUUSD&key=${token}`,
      openTradesVoice: `${baseUrl}/api/v1/carplay/trades?key=${token}`,
      marketBriefingVoice: `${baseUrl}/api/v1/carplay/briefing?symbol=XAUUSD&key=${token}`,
      lockBreakevenVoice: `${baseUrl}/api/v1/carplay/action?action=BE&key=${token}`,
      bookHalfProfitVoice: `${baseUrl}/api/v1/carplay/action?action=CLOSE_50&key=${token}`,
      panicCloseVoice: `${baseUrl}/api/v1/carplay/action?action=PANIC&key=${token}`,
    };

    return reply.send({
      success: true,
      carPlayToken: token,
      endpoints,
      instructions: [
        '1. Open the "Shortcuts" app on your iPhone.',
        '2. Tap the "+" icon to create a new shortcut and name it (e.g. "Gold Price" or "Check Trades").',
        '3. Add the action: "Get Contents of URL" and paste the corresponding SetupMint CarPlay Voice URL.',
        '4. Add the action: "Speak Text" connected to the URL output.',
        '5. Done! Whenever you are in your car, say "Hey Siri, Gold Price" or "Hey Siri, Check Trades" and your car will speak the answer aloud!',
      ],
    });
  });

  /**
   * POST /regenerate-token: Regenerates CarPlay security token
   */
  app.post('/regenerate-token', { preHandler: [requireAuth] }, async (req: any, reply) => {
    const user = await User.findById(req.user?.id);
    if (!user) return reply.status(404).send({ success: false, error: 'User not found' });

    const newToken = crypto.randomBytes(16).toString('hex');
    if (!user.liveWatcherSettings) user.liveWatcherSettings = {} as any;
    user.liveWatcherSettings!.carPlayToken = newToken;
    await user.save();

    return reply.send({
      success: true,
      carPlayToken: newToken,
    });
  });
};
