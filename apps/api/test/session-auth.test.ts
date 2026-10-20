import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { Session, User } from '../src/db/models/index.js';
import { config, validateConfig } from '../src/config.js';
import { hashSessionToken, SESSION_COOKIE_NAME } from '../src/middleware/auth.js';

describe('Persistent Sliding Sessions & Device Management Integration Tests', () => {
  let app: FastifyInstance;
  let testUser: any;
  let otherUser: any;

  async function createTestSession(userId: string, opts: any = {}) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashSessionToken(rawToken);
    const now = new Date();
    const session = await Session.create({
      userId,
      tokenHash,
      expiresAt: opts.expiresAt || new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
      absoluteExpiresAt: opts.absoluteExpiresAt || new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
      lastUsedAt: opts.lastUsedAt || now,
      userAgent: opts.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ipAddress: opts.ipAddress || '127.0.0.1',
      ...opts,
    });
    return { rawToken, tokenHash, cookie: `${SESSION_COOKIE_NAME}=${rawToken}`, session };
  }

  beforeAll(async () => {
    await connectDatabase();
    await Session.collection.dropIndex('token_1').catch(() => {});
    app = await buildApp();
    await app.ready();

    // Create 2 test users directly in DB to bypass register rate limits in integration tests
    const pwHash = await bcrypt.hash('Password@123', 10);
    testUser = await User.create({
      email: `persistent_user_${Date.now()}@tradevault.local`,
      passwordHash: pwHash,
      name: 'Persistent User',
      baseCurrency: 'INR',
      theme: 'dark',
    });

    otherUser = await User.create({
      email: `other_user_${Date.now()}@tradevault.local`,
      passwordHash: pwHash,
      name: 'Other User',
      baseCurrency: 'INR',
      theme: 'dark',
    });
  });

  afterAll(async () => {
    await app.close();
    await disconnectDatabase();
  });

  it('1. Cookie on login has Max-Age, Expires, HttpOnly, and SameSite=Lax', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: testUser.email, password: 'Password@123' },
    });
    expect(loginRes.statusCode).toBe(200);

    const setCookieHeader = loginRes.headers['set-cookie'];
    const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader[0] : (setCookieHeader as string);
    expect(cookieStr).toBeDefined();

    // Verify Cookie attributes
    expect(cookieStr).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cookieStr.toLowerCase()).toContain('httponly');
    expect(cookieStr.toLowerCase()).toContain('samesite=lax');
    expect(cookieStr.toLowerCase()).toContain('max-age=');
    expect(cookieStr.toLowerCase()).toContain('expires=');
    expect(cookieStr.toLowerCase()).toContain('path=/');

    // In dev / test, Domain=localhost should be omitted to prevent browser rejection
    expect(cookieStr.toLowerCase()).not.toContain('domain=localhost');
  });

  it('2. Token is stored hashed: raw token never appears in database', async () => {
    const { rawToken, tokenHash } = await createTestSession(testUser._id.toString());

    // Verify tokenHash exists in DB and equals SHA-256 of rawToken
    const sessionInDb = await Session.findOne({ tokenHash });
    expect(sessionInDb).not.toBeNull();
    expect(sessionInDb?.tokenHash).toBe(tokenHash);

    // Raw token must NOT be stored in the session record
    expect(sessionInDb?.token).toBeUndefined();

    // Querying by raw token should return null
    const rawMatch = await Session.findOne({ token: rawToken });
    expect(rawMatch).toBeNull();
  });

  it('3. Sliding renewal: session with < 50% idle lifetime remaining gets renewed with a Set-Cookie', async () => {
    // Idle lifetime is 90 days. Set expiresAt to now + 10 days (< 45 days, so < 50% remaining)
    const oldExpiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const { cookie, tokenHash } = await createTestSession(testUser._id.toString(), {
      expiresAt: oldExpiresAt,
    });

    // Make an authenticated call
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie },
    });
    expect(meRes.statusCode).toBe(200);

    // Must re-issue cookie with updated lifetime
    const setCookieHeader = meRes.headers['set-cookie'];
    expect(setCookieHeader).toBeDefined();

    // Check DB: expiresAt should now be extended (~ now + 90 days)
    const updatedSession = await Session.findOne({ tokenHash });
    expect(updatedSession?.expiresAt.getTime()).toBeGreaterThan(oldExpiresAt.getTime() + 50 * 24 * 60 * 60 * 1000);
  });

  it('4. Session with > 50% idle lifetime remaining does not re-issue cookie or write new expiry', async () => {
    // Idle lifetime is 90 days. Keep 80 days remaining (> 50%)
    const freshExpiresAt = new Date(Date.now() + 80 * 24 * 60 * 60 * 1000);
    const { cookie } = await createTestSession(testUser._id.toString(), {
      expiresAt: freshExpiresAt,
    });

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie },
    });
    expect(meRes.statusCode).toBe(200);

    // Should NOT send Set-Cookie header
    expect(meRes.headers['set-cookie']).toBeUndefined();
  });

  it('5. Expired idle session returns 401 SESSION_EXPIRED', async () => {
    const { cookie } = await createTestSession(testUser._id.toString(), {
      expiresAt: new Date(Date.now() - 1000), // in the past
    });

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie },
    });
    expect(meRes.statusCode).toBe(401);
    const body = JSON.parse(meRes.body);
    expect(body.error.code).toBe('SESSION_EXPIRED');
  });

  it('6. Session past absoluteExpiresAt returns 401 SESSION_EXPIRED even if idle expiresAt is in future', async () => {
    const { cookie } = await createTestSession(testUser._id.toString(), {
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      absoluteExpiresAt: new Date(Date.now() - 5000), // absolute cap in past
    });

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie },
    });
    expect(meRes.statusCode).toBe(401);
    const body = JSON.parse(meRes.body);
    expect(body.error.code).toBe('SESSION_EXPIRED');
  });

  it('7. Legacy migration: Session stored with plaintext token works once and gets upgraded to tokenHash', async () => {
    // Manually create a legacy session with plaintext token (no tokenHash, no absoluteExpiresAt)
    const legacyRawToken = crypto.randomBytes(32).toString('hex');
    const legacySession = await Session.create({
      userId: testUser._id,
      token: legacyRawToken,
      expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      userAgent: 'LegacyBrowser/1.0',
      ipAddress: '127.0.0.1',
    });

    const cookie = `${SESSION_COOKIE_NAME}=${legacyRawToken}`;

    // Request with legacy token
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie },
    });
    expect(meRes.statusCode).toBe(200);

    // Verify upgrade in DB
    const upgraded = await Session.findById(legacySession._id);
    expect(upgraded?.tokenHash).toBe(hashSessionToken(legacyRawToken));
    expect(upgraded?.token).toBeUndefined(); // plaintext token removed
    expect(upgraded?.absoluteExpiresAt).toBeDefined(); // absolute cap populated
  });

  it('8. GET /api/v1/auth/sessions lists active sessions with isCurrent and never exposes tokens/hashes', async () => {
    const { cookie, session } = await createTestSession(testUser._id.toString(), {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0',
    });

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/sessions',
      headers: { cookie },
    });
    expect(listRes.statusCode).toBe(200);
    const body = JSON.parse(listRes.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);

    const current = body.data.find((s: any) => s.id === session._id.toString());
    expect(current).toBeDefined();
    expect(current.isCurrent).toBe(true);
    expect(current.userAgent).toContain('Chrome');
    expect(current.ipAddress).toBe('127.0.0.1');

    // Critical security: must NEVER return token or tokenHash
    body.data.forEach((s: any) => {
      expect(s.token).toBeUndefined();
      expect(s.tokenHash).toBeUndefined();
    });
  });

  it('9. DELETE /api/v1/auth/sessions/:id: 404 on another user session; successfully revokes own session', async () => {
    const user1Session = await createTestSession(testUser._id.toString());
    const user2Session = await createTestSession(otherUser._id.toString());

    // User 1 attempts to revoke User 2's session -> must return 404 NOT_FOUND (tenant isolation)
    const stealDel = await app.inject({
      method: 'DELETE',
      url: `/api/v1/auth/sessions/${user2Session.session._id.toString()}`,
      headers: { cookie: user1Session.cookie },
    });
    expect(stealDel.statusCode).toBe(404);

    // Create a secondary session for User 1
    const secondarySession = await createTestSession(testUser._id.toString());

    // User 1 revokes secondary session -> 200
    const ownDel = await app.inject({
      method: 'DELETE',
      url: `/api/v1/auth/sessions/${secondarySession.session._id.toString()}`,
      headers: { cookie: user1Session.cookie },
    });
    expect(ownDel.statusCode).toBe(200);

    // Secondary session should now be deleted
    const checkDb = await Session.findById(secondarySession.session._id);
    expect(checkDb).toBeNull();

    // User 1's main session still works
    const checkUser1 = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: user1Session.cookie },
    });
    expect(checkUser1.statusCode).toBe(200);
  });

  it('10. POST /api/v1/auth/logout-all revokes other sessions and keeps current session', async () => {
    // Clear any previous sessions for a clean test user
    const isolatedUser = await User.create({
      email: `logout_iso_${Date.now()}@tradevault.local`,
      passwordHash: await bcrypt.hash('Password@123', 10),
      name: 'Logout Iso',
      baseCurrency: 'INR',
    });

    const current = await createTestSession(isolatedUser._id.toString());
    await createTestSession(isolatedUser._id.toString());
    await createTestSession(isolatedUser._id.toString());

    expect(await Session.countDocuments({ userId: isolatedUser._id })).toBe(3);

    // Logout all other sessions
    const logoutAllRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout-all',
      headers: { cookie: current.cookie },
      payload: {},
    });
    expect(logoutAllRes.statusCode).toBe(200);

    // Check count after: exactly 1 session remains (current)
    const afterCount = await Session.countDocuments({ userId: isolatedUser._id });
    expect(afterCount).toBe(1);

    // Current session is still active
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: current.cookie },
    });
    expect(meRes.statusCode).toBe(200);
  });

  it('11. Password change (POST /api/v1/settings/change-password) revokes other active sessions', async () => {
    const pwUser = await User.create({
      email: `pw_user_${Date.now()}@tradevault.local`,
      passwordHash: await bcrypt.hash('OldPassword@123', 10),
      name: 'PW User',
      baseCurrency: 'INR',
    });

    const currentSession = await createTestSession(pwUser._id.toString());
    const tabletSession = await createTestSession(pwUser._id.toString());

    expect(await Session.countDocuments({ userId: pwUser._id })).toBe(2);

    // Change password on current device
    const pwRes = await app.inject({
      method: 'POST',
      url: '/api/v1/settings/change-password',
      headers: { cookie: currentSession.cookie },
      payload: {
        currentPassword: 'OldPassword@123',
        newPassword: 'NewPassword@123',
      },
    });
    expect(pwRes.statusCode).toBe(200);

    // Other session was revoked
    expect(await Session.countDocuments({ userId: pwUser._id })).toBe(1);

    // Tablet token now returns 401
    const extraMe = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: tabletSession.cookie },
    });
    expect(extraMe.statusCode).toBe(401);

    // Current session still works
    const currMe = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: currentSession.cookie },
    });
    expect(currMe.statusCode).toBe(200);
  });

  it('12. Production startup fails fast if SESSION_SECRET is missing or weak', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.SESSION_SECRET;

    try {
      config.nodeEnv = 'production';
      delete process.env.SESSION_SECRET;

      expect(() => validateConfig()).toThrow(/FATAL: In production/);

      process.env.SESSION_SECRET = 'short';
      expect(() => validateConfig()).toThrow(/at least 32 characters/);

      process.env.SESSION_SECRET = 'tradevault-cloud-session-secret-change-in-prod-32chars';
      expect(() => validateConfig()).toThrow(/default dev fallback/);

      // Strong production secret passes
      process.env.SESSION_SECRET = 'a_very_strong_production_secret_32chars_long!';
      expect(() => validateConfig()).not.toThrow();
    } finally {
      config.nodeEnv = originalEnv || 'test';
      if (originalSecret) {
        process.env.SESSION_SECRET = originalSecret;
      } else {
        delete process.env.SESSION_SECRET;
      }
    }
  });
});
