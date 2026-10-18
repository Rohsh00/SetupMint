import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { loginSchema, registerSchema } from '@tradevault/shared';
import { User } from '../db/models/index.js';
import { clearSession, createSession, requireAuth, SESSION_COOKIE_NAME } from '../middleware/auth.js';

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

  // Login with stricter rate limiting
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
          createdAt: user.createdAt,
        },
      },
    });
  });
};
