import { FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { Session, User } from '../db/models/index.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  baseCurrency: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
    sessionId?: string;
  }
}

export const SESSION_COOKIE_NAME = 'tv_session';

export async function createSession(
  userId: string,
  req: FastifyRequest,
  reply: FastifyReply
): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await Session.create({
    userId,
    token,
    expiresAt,
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  });

  reply.setCookie(SESSION_COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
  });

  return token;
}

export async function clearSession(
  token: string,
  reply: FastifyReply
): Promise<void> {
  await Session.deleteOne({ token });
  reply.clearCookie(SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Extract token from cookie or Authorization header
  let token = req.cookies[SESSION_COOKIE_NAME];

  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.slice(7);
  }

  if (!token) {
    return reply.status(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }

  const session = await Session.findOne({
    token,
    expiresAt: { $gt: new Date() },
  });

  if (!session) {
    return reply.status(401).send({
      success: false,
      error: { code: 'SESSION_EXPIRED', message: 'Session expired or invalid' },
    });
  }

  const user = await User.findById(session.userId);
  if (!user) {
    return reply.status(401).send({
      success: false,
      error: { code: 'USER_NOT_FOUND', message: 'User not found' },
    });
  }

  req.user = {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    baseCurrency: user.baseCurrency,
  };
  req.sessionId = session._id.toString();
}
