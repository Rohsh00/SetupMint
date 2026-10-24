import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server.js';
import { connectDatabase, disconnectDatabase } from '../src/db/connection.js';
import { AccountTransaction } from '../src/db/models/index.js';

describe('Cash Ledger Import', () => {
  let app: FastifyInstance;
  let authCookie: string;
  let accountId: string;

  const ledgerCsv = [
    'Report Title,Funds Statement',
    'Client Code,FYERS123',
    'Date Range,01 Oct 2026 to 31 Oct 2026',
    '',
    'Date,Transaction Type,Particulars,Credit,Debit,Closing Balance',
    '16 Oct 2026,BR,UPI deposit,"50,000.00",,"1,50,000.00"',
    '17 Oct 2026,BP,Bank withdrawal,,"10,000.00","1,40,000.00"',
    '18 Oct 2026,JV,Brokerage and GST charges,,"500.00","1,39,500.00"',
    '19 Oct 2026,SJ,Intraday trade,"1,000.00",,"1,40,500.00"',
  ].join('\n');

  const mapping = {
    date: 'Date',
    transactionType: 'Transaction Type',
    description: 'Particulars',
    credit: 'Credit',
    debit: 'Debit',
    balance: 'Closing Balance',
  };

  beforeAll(async () => {
    await connectDatabase();
    app = await buildApp();
    await app.ready();

    const registerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `ledger_${Date.now()}@tradevault.local`,
        password: 'Password@123',
        name: 'Ledger Trader',
        baseCurrency: 'INR',
      },
    });
    expect(registerRes.statusCode).toBe(201);
    const cookies = registerRes.headers['set-cookie'];
    authCookie = Array.isArray(cookies) ? cookies[0] : (cookies as string);

    const accountRes = await app.inject({
      method: 'POST',
      url: '/api/v1/accounts',
      headers: { cookie: authCookie },
      payload: {
        name: 'FYERS Ledger Account',
        broker: 'FYERS',
        accountType: 'EQUITY',
        baseCurrency: 'INR',
        initialBalance: 100000,
      },
    });
    expect(accountRes.statusCode).toBe(201);
    accountId = JSON.parse(accountRes.body).data.id;
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    await disconnectDatabase();
  });

  it('previews ledger rows, classifies cash flows, and ignores trading rows', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/export/import/preview?importKind=CASH_FLOWS&accountId=${accountId}&broker=FYERS`,
      headers: { cookie: authCookie },
      payload: { csvText: ledgerCsv },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.importKind).toBe('CASH_FLOWS');
    expect(body.data.totalRows).toBe(4);
    expect(body.data.detectedBroker).toBe('FYERS');
    expect(body.data.suggestedMapping).toMatchObject(mapping);
    expect(body.data.summary).toMatchObject({
      depositCount: 1,
      withdrawalCount: 1,
      adjustmentCount: 1,
      ignoredCount: 1,
      duplicateCount: 0,
      errorCount: 0,
    });
    expect(body.data.allRows.map((row: any) => row.type)).toEqual([
      'DEPOSIT',
      'WITHDRAWAL',
      'ADJUSTMENT',
      'IGNORE',
    ]);
    expect(body.data.allRows[2].amount).toBe(-500);
  });

  it('commits deposits, withdrawals, and signed adjustments and recalculates the balance', async () => {
    const previewRes = await app.inject({
      method: 'POST',
      url: `/api/v1/export/import/preview?importKind=CASH_FLOWS&accountId=${accountId}&broker=FYERS`,
      headers: { cookie: authCookie },
      payload: { csvText: ledgerCsv },
    });
    const previewBody = JSON.parse(previewRes.body);

    const commitRes = await app.inject({
      method: 'POST',
      url: '/api/v1/export/import/commit',
      headers: { cookie: authCookie },
      payload: {
        accountId,
        importKind: 'CASH_FLOWS',
        rows: previewBody.data.allRows,
        mapping,
        broker: 'FYERS',
        saveMapping: true,
      },
    });

    expect(commitRes.statusCode).toBe(200);
    const commitBody = JSON.parse(commitRes.body);
    expect(commitBody.data.importedCount).toBe(3);
    expect(commitBody.data.duplicateCount).toBe(0);
    expect(commitBody.data.errorCount).toBe(0);
    expect(commitBody.data.balanceSummary).toMatchObject({
      totalDeposits: 50000,
      totalWithdrawals: 10000,
      totalAdjustments: -500,
      currentBalance: 139500,
    });

    const txCount = await AccountTransaction.countDocuments({
      accountId,
      source: 'BROKER_LEDGER_IMPORT',
    });
    expect(txCount).toBe(3);

    const accountRes = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${accountId}`,
      headers: { cookie: authCookie },
    });
    const accountBody = JSON.parse(accountRes.body);
    expect(accountBody.data.currentBalance).toBe(139500);
    expect(accountBody.data.totalAdjustments).toBe(-500);
  });

  it('detects and skips duplicate ledger rows on re-import', async () => {
    const previewRes = await app.inject({
      method: 'POST',
      url: `/api/v1/export/import/preview?importKind=CASH_FLOWS&accountId=${accountId}&broker=FYERS`,
      headers: { cookie: authCookie },
      payload: { csvText: ledgerCsv },
    });
    const previewBody = JSON.parse(previewRes.body);
    expect(previewBody.data.summary.duplicateCount).toBe(3);

    const commitRes = await app.inject({
      method: 'POST',
      url: '/api/v1/export/import/commit',
      headers: { cookie: authCookie },
      payload: {
        accountId,
        importKind: 'CASH_FLOWS',
        rows: previewBody.data.allRows,
        mapping,
        broker: 'FYERS',
        saveMapping: false,
      },
    });

    expect(commitRes.statusCode).toBe(200);
    const commitBody = JSON.parse(commitRes.body);
    expect(commitBody.data.importedCount).toBe(0);
    expect(commitBody.data.duplicateCount).toBe(3);
  });

  it('saves ledger mappings separately from trade mappings', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/export/mappings/FYERS?importKind=CASH_FLOWS',
      headers: { cookie: authCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.importKind).toBe('CASH_FLOWS');
    expect(body.data.mapping).toMatchObject(mapping);
  });

  it('lists ledger batches separately and undoes them', async () => {
    const batchesRes = await app.inject({
      method: 'GET',
      url: '/api/v1/export/import/batches',
      headers: { cookie: authCookie },
    });
    expect(batchesRes.statusCode).toBe(200);
    const batchesBody = JSON.parse(batchesRes.body);
    expect(batchesBody.data).toHaveLength(1);
    expect(batchesBody.data[0]).toMatchObject({
      importKind: 'CASH_FLOWS',
      tradeCount: 0,
      ledgerCount: 3,
      totalAmount: 39500,
    });

    const undoRes = await app.inject({
      method: 'POST',
      url: '/api/v1/export/import/undo',
      headers: { cookie: authCookie },
      payload: { batchId: batchesBody.data[0].batchId },
    });
    expect(undoRes.statusCode).toBe(200);
    const undoBody = JSON.parse(undoRes.body);
    expect(undoBody.data.ledgerDeletedCount).toBe(3);
    expect(undoBody.data.deletedCount).toBe(3);

    const accountRes = await app.inject({
      method: 'GET',
      url: `/api/v1/accounts/${accountId}`,
      headers: { cookie: authCookie },
    });
    const accountBody = JSON.parse(accountRes.body);
    expect(accountBody.data.currentBalance).toBe(100000);
    expect(accountBody.data.totalAdjustments).toBe(0);
  });
});
