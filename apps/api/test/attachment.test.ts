import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { Attachment, Trade } from '../src/db/models/index.js';
import { config } from '../src/config.js';

describe('TradeVault Attachments & Chart Screenshot Tests', () => {
  let app: FastifyInstance;
  let authCookie: string;
  let accountId: string;
  let tradeId: string;
  let attachmentId: string;

  // 12-byte valid PNG header
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  ]);

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    // Register user
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

    // Create Account
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

    // Create Trade
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

  it('DELETE /api/v1/attachments/:id deletes attachment and updates trade', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/attachments/${attachmentId}`,
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);

    // Verify deleted from DB
    const att = await Attachment.findById(attachmentId);
    expect(att).toBeNull();

    // Verify pulled from Trade.screenshotIds
    const trade = await Trade.findById(tradeId);
    expect(trade?.screenshotIds.map((id) => id.toString())).not.toContain(attachmentId);
  });

  it('DELETE /api/v1/trades/:id cleans up all linked attachments', async () => {
    // 1. Upload another attachment to this trade
    const boundary = '----TestBoundaryCleanup';
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="cleanup_test.png"\r\nContent-Type: image/png\r\n\r\n`),
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
    const newAttId = JSON.parse(uploadRes.body).data.id;

    // 2. Delete the trade
    const delTradeRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/trades/${tradeId}`,
      headers: { cookie: authCookie },
    });
    expect(delTradeRes.statusCode).toBe(200);

    // 3. Verify attachment was deleted from DB
    const attAfter = await Attachment.findById(newAttId);
    expect(attAfter).toBeNull();
  });
});
