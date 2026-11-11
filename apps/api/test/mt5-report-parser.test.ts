import { describe, it, expect } from 'vitest';
import { parseMt5Report } from '../src/services/mt5-report-parser.js';

describe('MT5 Report Parser', () => {
  it('parses tab-delimited MT5 Positions table copy', () => {
    const raw = `
Time	Position	Symbol	Type	Volume	Price	S / L	T / P	Time	Price	Commission	Swap	Profit
2026.11.11 08:30:15	14541005	XAUUSD	buy	0.01	4118.18	4116.40	0.00	2026.11.11 09:03:42	4134.40	0.00	0.00	16.22
2026.11.11 09:27:54	14549345	XAUUSD	sell	0.01	4125.50	4128.00	0.00	2026.11.11 09:50:46	4120.22	0.00	0.00	5.28
    `;

    const trades = parseMt5Report(raw);
    expect(trades.length).toBe(2);

    expect(trades[0].ticket).toBe('14541005');
    expect(trades[0].symbol).toBe('XAUUSD');
    expect(trades[0].direction).toBe('LONG');
    expect(trades[0].volume).toBe(0.01);
    expect(trades[0].entryPrice).toBe(4118.18);
    expect(trades[0].exitPrice).toBe(4134.40);
    expect(trades[0].stopLoss).toBe(4116.40);
    expect(trades[0].profit).toBe(16.22);
    expect(trades[0].status).toBe('CLOSED');

    expect(trades[1].ticket).toBe('14549345');
    expect(trades[1].direction).toBe('SHORT');
    expect(trades[1].profit).toBe(5.28);
  });

  it('parses MT5 HTML statement table rows', () => {
    const html = `
      <table>
        <tr bgcolor="#FFFFFF" align="right">
          <td align="left">2026.11.11 08:30:15</td>
          <td>14541005</td>
          <td align="left">XAUUSD</td>
          <td align="left">buy</td>
          <td>0.01</td>
          <td>4118.18</td>
          <td>4116.40</td>
          <td>0.00</td>
          <td align="left">2026.11.11 09:03:42</td>
          <td>4134.40</td>
          <td>0.00</td>
          <td>0.00</td>
          <td>16.22</td>
          <td align="left">elefin</td>
        </tr>
      </table>
    `;

    const trades = parseMt5Report(html);
    expect(trades.length).toBe(1);
    expect(trades[0].ticket).toBe('14541005');
    expect(trades[0].profit).toBe(16.22);
    expect(trades[0].exitPrice).toBe(4134.40);
  });

  it('parses MT5 JSON payload array', () => {
    const json = JSON.stringify([
      {
        ticket: 14593330,
        symbol: 'XAUUSD',
        type: 'BUY',
        volume: 0.02,
        open_price: 4042.0,
        close_price: 4044.26,
        profit: 4.38,
        commission: 0.14,
        swap: 0,
        open_time: '2026-11-11T13:01:58Z',
        close_time: '2026-11-11T13:13:34Z',
      },
    ]);

    const trades = parseMt5Report(json);
    expect(trades.length).toBe(1);
    expect(trades[0].ticket).toBe('14593330');
    expect(trades[0].direction).toBe('LONG');
    expect(trades[0].entryPrice).toBe(4042.0);
    expect(trades[0].exitPrice).toBe(4044.26);
    expect(trades[0].profit).toBe(4.38);
    expect(trades[0].commission).toBe(0.14);
  });

  it('parses paired in/out deals from Deals view', () => {
    const raw = `
Time	Deal	Symbol	Type	Direction	Volume	Price	Order	Commission	Swap	Profit
2026.11.11 08:30:15	1001	XAUUSD	buy	in	0.01	4118.18	14541005	-0.05	0.00	0.00
2026.11.11 09:03:42	1002	XAUUSD	sell	out	0.01	4134.40	14541005	-0.05	0.00	16.22
    `;

    const trades = parseMt5Report(raw);
    expect(trades.length).toBe(1);
    expect(trades[0].ticket).toBe('14541005');
    expect(trades[0].entryPrice).toBe(4118.18);
    expect(trades[0].exitPrice).toBe(4134.40);
    expect(trades[0].profit).toBe(16.22);
    expect(trades[0].commission).toBe(0.1);
  });

  it('parses vertical cell-per-line paste format', () => {
    const vertical = `
14541005
XAUUSD
Buy
2026.11.11 08:30:15
4118.18
0.01
2026.11.11 09:03:42
4134.40
16.22
    `;

    const trades = parseMt5Report(vertical);
    expect(trades.length).toBe(1);
    expect(trades[0].ticket).toBe('14541005');
    expect(trades[0].symbol).toBe('XAUUSD');
    expect(trades[0].direction).toBe('LONG');
    expect(trades[0].volume).toBe(0.01);
    expect(trades[0].entryPrice).toBe(4118.18);
    expect(trades[0].exitPrice).toBe(4134.40);
    expect(trades[0].profit).toBe(16.22);
  });
});
