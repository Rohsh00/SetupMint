import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { loginSchema, registerSchema } from '@tradevault/shared';
import { Session, User } from '../db/models/index.js';
import {
  clearSession,
  clearSessionCookie,
  createSession,
  hashSessionToken,
  requireAuth,
  SESSION_COOKIE_NAME,
} from '../middleware/auth.js';
import { validateObjectIdParam } from '../middleware/validate.js';

export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Register with stricter rate limiting
  app.post(
    '/register',
    {
      config: {
        rateLimit: {
          max: 15,
          timeWindow: '1 minute',
        },
      },
    },
    async (req, reply) => {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid registration details',
          details: parseResult.error.format(),
        },
      });
    }

    const { email, password, name, baseCurrency } = parseResult.data;

    const existing = await User.findOne({ email });
    if (existing) {
      return reply.status(409).send({
        success: false,
        error: { code: 'USER_EXISTS', message: 'A user with this email already exists' },
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email,
      passwordHash,
      name,
      baseCurrency,
      theme: 'dark',
    });

    const token = await createSession(user._id.toString(), req, reply);

    return reply.status(201).send({
      success: true,
      data: {
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          baseCurrency: user.baseCurrency,
          theme: user.theme,
        },
        token,
      },
    });
  });

  // Login with stricter rate limiting & token rotation
  app.post(
    '/login',
    {
      config: {
        rateLimit: {
          max: 15,
          timeWindow: '1 minute',
        },
      },
    },
    async (req, reply) => {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email and password required',
          details: parseResult.error.format(),
        },
      });
    }

    const { email, password } = parseResult.data;
    const user = await User.findOne({ email });

    if (!user) {
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
    }

    // Token Rotation on login: revoke previous session if one was passed in cookie/header
    let existingToken = req.cookies[SESSION_COOKIE_NAME];
    if (!existingToken && req.headers.authorization?.startsWith('Bearer ')) {
      existingToken = req.headers.authorization.slice(7);
    }
    if (existingToken) {
      const existingHash = hashSessionToken(existingToken);
      await Session.deleteMany({
        $or: [{ tokenHash: existingHash }, { token: existingToken }],
      }).catch(() => {});
    }

    const token = await createSession(user._id.toString(), req, reply);

    return reply.send({
      success: true,
      data: {
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          baseCurrency: user.baseCurrency,
          theme: user.theme,
        },
        token,
      },
    });
  });

  // Logout
  app.post('/logout', async (req, reply) => {
    let token = req.cookies[SESSION_COOKIE_NAME];
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.slice(7);
    }

    await clearSession(token, reply);

    return reply.send({ success: true, message: 'Logged out successfully' });
  });

  // Get current user profile
  app.get('/me', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = await User.findById(req.user!.id);
    if (!user) {
      return reply.status(404).send({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }

    return reply.send({
      success: true,
      data: {
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          baseCurrency: user.baseCurrency,
          theme: user.theme,
          riskSettings: user.riskSettings,
          patternDetectionSettings: user.patternDetectionSettings,
          createdAt: user.createdAt,
        },
      },
    });
  });

  // ==========================================
  // Session & Device Management Endpoints
  // ==========================================

  // List current user's active sessions (never exposes raw tokens or hashes)
  app.get('/sessions', { preHandler: [requireAuth] }, async (req, reply) => {
    const now = new Date();
    const sessions = await Session.find({
      userId: req.user!.id,
      expiresAt: { $gt: now },
      $or: [{ absoluteExpiresAt: { $gt: now } }, { absoluteExpiresAt: { $exists: false } }],
    }).sort({ lastUsedAt: -1, createdAt: -1 });

    return reply.send({
      success: true,
      data: sessions.map((s) => ({
        id: s._id.toString(),
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt || s.createdAt,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        isCurrent: s._id.toString() === req.sessionId,
      })),
    });
  });

  // Revoke one session by ID (404 if not found or belongs to another user)
  app.delete(
    '/sessions/:id',
    { preHandler: [requireAuth, validateObjectIdParam('id')] },
    async (req: any, reply) => {
      const session = await Session.findOne({
        _id: req.params.id,
        userId: req.user!.id,
      });

      if (!session) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Session not found' },
        });
      }

      await Session.deleteOne({ _id: session._id });

      // If the revoked session was the current device session, clear cookie
      if (session._id.toString() === req.sessionId) {
        clearSessionCookie(reply);
      }

      return reply.send({
        success: true,
        message: 'Session revoked successfully',
      });
    }
  );

  // Revoke all sessions (except current by default; revokes all if includeCurrent=true)
  app.post('/logout-all', { preHandler: [requireAuth] }, async (req: any, reply) => {
    const { includeCurrent } = req.body || {};

    if (includeCurrent) {
      await Session.deleteMany({ userId: req.user!.id });
      clearSessionCookie(reply);
      return reply.send({
        success: true,
        message: 'All sessions revoked successfully',
      });
    } else {
      await Session.deleteMany({
        userId: req.user!.id,
        _id: { $ne: req.sessionId },
      });
      return reply.send({
        success: true,
        message: 'All other sessions revoked successfully',
      });
    }
  });
};

