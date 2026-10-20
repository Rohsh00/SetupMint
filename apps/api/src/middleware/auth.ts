import { FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { Session, User } from '../db/models/index.js';
import { config } from '../config.js';

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

/**
 * Computes a secure SHA-256 hash of a raw session token.
 * Raw tokens are never persisted in the database.
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Configures the session cookie with production-grade lifetime and security flags.
 */
export function setSessionCookie(
  reply: FastifyReply,
  rawToken: string,
  expiresAt: Date
): void {
  const maxAgeSeconds = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));

  reply.setCookie(SESSION_COOKIE_NAME, rawToken, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    maxAge: maxAgeSeconds,
    expires: expiresAt,
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  });
}

/**
 * Clears the session cookie using identical Path, SameSite, Secure, and Domain options.
 */
export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  });
}

/**
 * Creates a new session with hashed token storage and sliding + absolute lifetimes.
 */
export async function createSession(
  userId: string,
  req: FastifyRequest,
  reply: FastifyReply
): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);

  const now = new Date();
  const idleLifetimeMs = config.sessionIdleDays * 24 * 60 * 60 * 1000;
  const absoluteLifetimeMs = config.sessionAbsoluteDays * 24 * 60 * 60 * 1000;

  const expiresAt = new Date(now.getTime() + idleLifetimeMs);
  const absoluteExpiresAt = new Date(now.getTime() + absoluteLifetimeMs);

  await Session.create({
    userId,
    tokenHash,
    expiresAt,
    absoluteExpiresAt,
    lastUsedAt: now,
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
  });

  setSessionCookie(reply, rawToken, expiresAt);
  return rawToken;
}

/**
 * Revokes a session by deleting it from the database and clearing the client cookie.
 */
export async function clearSession(
  token: string | undefined,
  reply: FastifyReply
): Promise<void> {
  if (token) {
    try {
      const tokenHash = hashSessionToken(token);
      await Session.deleteMany({
        $or: [{ tokenHash }, { token }],
      });
    } catch {
      // Ignore DB errors during session revocation
    }
  }
  clearSessionCookie(reply);
}

/**
 * Authentication middleware with sliding session renewal and legacy migration fallback.
 */
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

  const presentedHash = hashSessionToken(token);
  const now = new Date();

  // 1. Primary lookup by tokenHash
  let session = await Session.findOne({ tokenHash: presentedHash });

  // 2. Migration fallback: support legacy sessions stored with raw plaintext token and upgrade on first use
  if (!session) {
    session = await Session.findOne({ token });
    if (session) {
      session.tokenHash = presentedHash;
      session.token = undefined;
      if (!session.absoluteExpiresAt) {
        const createdAtMs = session.createdAt ? session.createdAt.getTime() : session._id.getTimestamp().getTime();
        session.absoluteExpiresAt = new Date(createdAtMs + config.sessionAbsoluteDays * 24 * 60 * 60 * 1000);
      }
      session.lastUsedAt = now;
      await session.save();
    }
  }

  if (!session) {
    return reply.status(401).send({
      success: false,
      error: { code: 'SESSION_EXPIRED', message: 'Session expired or invalid' },
    });
  }

  // 3. Expiration checks: verify both sliding idle lifetime and absolute hard cap
  const isIdleExpired = session.expiresAt.getTime() <= now.getTime();
  const isAbsoluteExpired = session.absoluteExpiresAt
    ? session.absoluteExpiresAt.getTime() <= now.getTime()
    : false;

  if (isIdleExpired || isAbsoluteExpired) {
    await Session.deleteOne({ _id: session._id }).catch(() => {});
    clearSessionCookie(reply);
    return reply.status(401).send({
      success: false,
      error: { code: 'SESSION_EXPIRED', message: 'Session expired or invalid' },
    });
  }

  // 4. Sliding Renewal
  // Renew only when remaining idle lifetime is below the threshold (< 50%) to prevent DB writes on every request
  const idleDurationMs = config.sessionIdleDays * 24 * 60 * 60 * 1000;
  const remainingIdleMs = session.expiresAt.getTime() - now.getTime();

  if (remainingIdleMs < idleDurationMs * config.sessionRenewThreshold) {
    const candidateExpiryMs = now.getTime() + idleDurationMs;
    const newExpiryMs = session.absoluteExpiresAt
      ? Math.min(candidateExpiryMs, session.absoluteExpiresAt.getTime())
      : candidateExpiryMs;

    const newExpiresAt = new Date(newExpiryMs);
    session.expiresAt = newExpiresAt;
    session.lastUsedAt = now;
    await session.save();

    // Re-issue cookie with updated maxAge & expires
    setSessionCookie(reply, token, newExpiresAt);
  } else {
    // Avoid DB write on every request; update lastUsedAt only if > 5 minutes have elapsed
    if (now.getTime() - session.lastUsedAt.getTime() > 5 * 60 * 1000) {
      await Session.updateOne({ _id: session._id }, { $set: { lastUsedAt: now } }).catch(() => {});
    }
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

