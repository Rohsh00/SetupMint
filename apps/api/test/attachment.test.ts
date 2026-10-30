import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import sharp from 'sharp';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { Attachment, Trade } from '../src/db/models/index.js';
import { setStorageForTests } from '../src/storage/index.js';
import { InMemoryStorage } from './in-memory-storage.js';

describe('TradeVault Attachments & Chart Screenshot Tests (Cloud Storage Provider)', () => {
  let app: FastifyInstance;
  let testStorage: InMemoryStorage;
  let authCookie: string;
  let authToken: string;
  let otherUserAuthCookie: string;
  let accountId: string;
  let tradeId: string;
  let attachmentId: string;
  let storedFilename: string;

  // 12-byte valid PNG header
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  ]);

  beforeAll(async () => {
    testStorage = new InMemoryStorage();
    setStorageForTests(testStorage);

    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Register User 1
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `chart_tester_${Date.now()}@tradevault.local`,
        password: 'Password@123',
        name: 'Chart Tester',
      },
    });
    authCookie = regRes.headers['set-cookie'] as string;
    authToken = JSON.parse(regRes.body).data.token;

    // Register User 2 (to test ownership 404)
    const regRes2 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `other_user_${Date.now()}@tradevault.local`,
        password: 'Password@123',
        name: 'Other Trader',
      },
    });
    otherUserAuthCookie = regRes2.headers['set-cookie'] as string;

    // Create Account for User 1
    const accRes = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      headers: { cookie: authCookie },
      payload: {
        name: 'Chart Test Account',
        broker: 'Zerodha',
        accountType: 'EQUITY',
        initialBalance: 100000,
        baseCurrency: 'INR',
      },
    });
    accountId = JSON.parse(accRes.body).data.id;

    // Create Trade for User 1
    const tradeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/trades',
      headers: { cookie: authCookie },
      payload: {
        accountId,
        symbol: 'NIFTY',
        assetClass: 'FUTURES',
        exchange: 'NSE',
        marketSegment: 'NSE_FNO',
        direction: 'LONG',
        status: 'CLOSED',
        tradeDate: '2026-10-18',
        entryTime: '2026-10-18T09:30:00.000Z',
        exitTime: '2026-10-18T10:15:00.000Z',
        simpleExecution: {
          entryPrice: 24000,
          exitPrice: 24100,
          quantity: 25,
          contractMultiplier: 1,
        },
      },
    });
    tradeId = JSON.parse(tradeRes.body).data.id;
  });

  afterAll(async () => {
    await app.close();
    await disconnectDatabase();
    setStorageForTests(null);
  });

  it('rejects upload with invalid magic bytes (fake png)', async () => {
    const boundary = '----TestBoundaryFake';
    const fakeBuffer = Buffer.from('THIS IS NOT A VALID PNG IMAGE FILE');

    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="fake.png"\r\nContent-Type: image/png\r\n\r\n`),
      fakeBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/attachments/trades/${tradeId}/upload`,
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        cookie: authCookie,
      },
      payload,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('INVALID_IMAGE_SIGNATURE');
    // Ensure invalid file never reached storage
    expect(testStorage.count()).toBe(0);
  });

  it('successfully uploads valid chart screenshot with category and caption', async () => {
    const boundary = '----TestBoundaryValid';

    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="nifty_5m_setup.png"\r\nContent-Type: image/png\r\n\r\n`),
      validPngBuffer,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="category"\r\n\r\nSETUP\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n15m Liquidity sweep with 5m FVG\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="timeframe"\r\n\r\n5m\r\n`),
      Buffer.from(`--${boundary}--\r\n`),
    ]);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/attachments/trades/${tradeId}/upload`,
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        cookie: authCookie,
      },
      payload,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.category).toBe('SETUP');
    expect(body.data.caption).toBe('15m Liquidity sweep with 5m FVG');
    expect(body.data.timeframe).toBe('5m');
    expect(body.data.originalName).toBe('nifty_5m_setup.png');
    expect(body.data.downloadUrl).toContain('/api/v1/attachments/');

    attachmentId = body.data.id;

    // Verify stored in cloud storage provider
    const attDoc = await Attachment.findById(attachmentId);
    expect(attDoc).toBeDefined();
    storedFilename = attDoc!.storedFilename;
    expect(await testStorage.exists(storedFilename)).toBe(true);

    // Verify Trade screenshotIds array contains this attachment
    const trade = await Trade.findById(tradeId);
    expect(trade?.screenshotIds.map((id) => id.toString())).toContain(attachmentId);
  });

  it('GET /api/v1/attachments/trades/:tradeId lists all attachments for trade', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/attachments/trades/${tradeId}`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.data[0].id).toBe(attachmentId);
    expect(body.data[0].category).toBe('SETUP');
  });

  it('GET /api/v1/trades/:id includes populated attachments array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/trades/${tradeId}`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.attachments).toBeDefined();
    expect(body.data.attachments.length).toBe(1);
    expect(body.data.attachments[0].id).toBe(attachmentId);
    expect(body.data.attachments[0].category).toBe('SETUP');
  });

  it('GET /api/v1/attachments/:id/download serves authenticated image stream', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/attachments/${attachmentId}/download`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.rawPayload.length).toBeGreaterThanOrEqual(validPngBuffer.length);
  });

  it('GET /api/v1/attachments/:id/stream serves authenticated image stream', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/attachments/${attachmentId}/stream`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.rawPayload.length).toBeGreaterThanOrEqual(validPngBuffer.length);
  });

  it('GET /api/v1/attachments/:id/download supports ?token= authentication without cookie or auth header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/attachments/${attachmentId}/download?token=${authToken}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.rawPayload.length).toBeGreaterThanOrEqual(validPngBuffer.length);
  });

  it('GET /api/v1/attachments/:id/stream supports ?token= authentication without cookie or auth header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/attachments/${attachmentId}/stream?token=${authToken}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.rawPayload.length).toBeGreaterThanOrEqual(validPngBuffer.length);
  });

  it('enforces tenant isolation and returns 404 when another user requests the attachment', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/attachments/${attachmentId}/stream`,
      headers: { cookie: otherUserAuthCookie },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('enforces tenant isolation and returns 404 when another user tries to delete the attachment', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/attachments/${attachmentId}`,
      headers: { cookie: otherUserAuthCookie },
    });

    expect(res.statusCode).toBe(404);
    // Ensure attachment was NOT deleted from storage
    expect(await testStorage.exists(storedFilename)).toBe(true);
  });

  it('PUT /api/v1/attachments/:id updates caption and category metadata', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/attachments/${attachmentId}`,
      headers: { cookie: authCookie },
      payload: {
        category: 'REVIEW',
        caption: 'Post-trade review note: perfect entry execution',
        timeframe: '15m',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.category).toBe('REVIEW');
    expect(body.data.caption).toBe('Post-trade review note: perfect entry execution');
    expect(body.data.timeframe).toBe('15m');
  });

  it('DELETE /api/v1/attachments/:id deletes attachment and updates trade and removes from storage', async () => {
    expect(await testStorage.exists(storedFilename)).toBe(true);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/attachments/${attachmentId}`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);

    // Verify deleted from DB
    const att = await Attachment.findById(attachmentId);
    expect(att).toBeNull();

    // Verify deleted from Cloudflare R2 / test storage provider
    expect(await testStorage.exists(storedFilename)).toBe(false);

    // Verify pulled from Trade.screenshotIds
    const trade = await Trade.findById(tradeId);
    expect(trade?.screenshotIds.map((id) => id.toString())).not.toContain(attachmentId);
  });

  it('uploads real generated PNG screenshot and stores optimized WebP/PNG record with matching ext and stream Content-Type', async () => {
    // Generate real PNG chart screenshot with sharp
    const realPngBuffer = await sharp({
      create: {
        width: 400,
        height: 250,
        channels: 4,
        background: { r: 15, g: 23, b: 42, alpha: 1 },
      },
    })
      .composite([
        {
          input: Buffer.from(`
            <svg width="400" height="250">
              <rect x="50" y="50" width="20" height="100" fill="#22c55e" />
              <rect x="100" y="80" width="20" height="70" fill="#ef4444" />
              <line x1="60" y1="20" x2="60" y2="180" stroke="#22c55e" stroke-width="2" />
              <line x1="110" y1="40" x2="110" y2="170" stroke="#ef4444" stroke-width="2" />
              <text x="150" y="100" font-family="monospace" font-size="16" fill="#f8fafc">BankNifty Breakout</text>
            </svg>
          `),
        },
      ])
      .png({ compressionLevel: 1 })
      .toBuffer();

    const boundary = '----TestBoundaryRealPng';
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="banknifty_breakout.png"\r\nContent-Type: image/png\r\n\r\n`),
      realPngBuffer,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="category"\r\n\r\nENTRY\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n5m confirmation candle entry\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="timeframe"\r\n\r\n5m\r\n`),
      Buffer.from(`--${boundary}--\r\n`),
    ]);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/attachments/trades/${tradeId}/upload`,
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        cookie: authCookie,
      },
      payload,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);

    const attDoc = await Attachment.findById(body.data.id);
    expect(attDoc).toBeDefined();

    // The stored record mimeType and storedFilename ext match the optimized output
    expect(['image/webp', 'image/png']).toContain(attDoc!.mimeType);
    const storedExt = path.extname(attDoc!.storedFilename).toLowerCase();
    expect(['.webp', '.png']).toContain(storedExt);
    if (attDoc!.mimeType === 'image/webp') {
      expect(storedExt).toBe('.webp');
    } else {
      expect(storedExt).toBe('.png');
    }

    // Size stored in database is smaller than the input PNG (wasOptimized=true)
    expect(attDoc!.sizeBytes).toBeLessThan(realPngBuffer.length);

    // Verify authenticated stream returns correct Content-Type matching stored mimeType
    const streamRes = await app.inject({
      method: 'GET',
      url: `/api/v1/attachments/${body.data.id}/stream`,
      headers: { cookie: authCookie },
    });
    expect(streamRes.statusCode).toBe(200);
    expect(streamRes.headers['content-type']).toBe(attDoc!.mimeType);
    if (storedExt === '.webp') {
      expect(streamRes.headers['content-disposition']).toContain('banknifty_breakout.webp');
    }

    // Clean up this attachment so 12-cap test is not affected
    await app.inject({
      method: 'DELETE',
      url: `/api/v1/attachments/${body.data.id}`,
      headers: { cookie: authCookie },
    });
  });

  it('enforces 12-image cap per trade', async () => {
    // Fill trade up to 12 screenshots
    const boundary = '----TestBoundaryCap';
    for (let i = 0; i < 12; i++) {
      const payload = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="cap_${i}.png"\r\nContent-Type: image/png\r\n\r\n`),
        validPngBuffer,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const uploadRes = await app.inject({
        method: 'POST',
        url: `/api/v1/attachments/trades/${tradeId}/upload`,
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
          cookie: authCookie,
        },
        payload,
      });
      expect(uploadRes.statusCode).toBe(201);
    }

    // 13th upload should be rejected
    const excessPayload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="cap_13.png"\r\nContent-Type: image/png\r\n\r\n`),
      validPngBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const excessRes = await app.inject({
      method: 'POST',
      url: `/api/v1/attachments/trades/${tradeId}/upload`,
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        cookie: authCookie,
      },
      payload: excessPayload,
    });

    expect(excessRes.statusCode).toBe(400);
    const body = JSON.parse(excessRes.body);
    expect(body.error.code).toBe('ATTACHMENT_LIMIT_EXCEEDED');
  }, 60000);

  it('DELETE /api/v1/trades/:id cleans up all linked attachments in DB and storage', async () => {
    const tradeBefore = await Trade.findById(tradeId);
    const countBefore = tradeBefore?.screenshotIds.length || 0;
    expect(countBefore).toBe(12);

    // Delete the trade
    const delTradeRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/trades/${tradeId}`,
      headers: { cookie: authCookie },
    });
    expect(delTradeRes.statusCode).toBe(200);

    // Verify all 12 attachments were deleted from DB
    const remainingAtts = await Attachment.find({ tradeId });
    expect(remainingAtts.length).toBe(0);

    // Verify storage cleanup
    expect(testStorage.count()).toBe(0);
  }, 30000);
});
