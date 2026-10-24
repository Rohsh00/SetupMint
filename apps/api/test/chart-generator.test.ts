import { describe, it, expect } from 'vitest';
import moment from 'moment';
import { ChartGeneratorService } from '../src/services/chart-generator.service.js';
import { ITradeCandle } from '@tradevault/shared';

describe('ChartGeneratorService Unit Tests', () => {
  const baseEntryTime = moment('2026-10-24T09:30:00.000Z');
  const baseExitTime = moment('2026-10-24T10:15:00.000Z');

  const sampleCandles: ITradeCandle[] = [
    { t: baseEntryTime.valueOf(), o: 2500, h: 2520, l: 2490, c: 2515, v: 1000 },
    { t: baseEntryTime.clone().add(5, 'minutes').valueOf(), o: 2515, h: 2535, l: 2510, c: 2530, v: 1200 },
    { t: baseEntryTime.clone().add(10, 'minutes').valueOf(), o: 2530, h: 2540, l: 2525, c: 2535, v: 800 },
    { t: baseEntryTime.clone().add(15, 'minutes').valueOf(), o: 2535, h: 2555, l: 2530, c: 2550, v: 1500 },
    { t: baseEntryTime.clone().add(20, 'minutes').valueOf(), o: 2550, h: 2560, l: 2545, c: 2555, v: 900 },
    { t: baseExitTime.valueOf(), o: 2555, h: 2570, l: 2550, c: 2565, v: 1100 },
  ];

  it('generates a clean placeholder SVG when candles array is empty', () => {
    const svg = ChartGeneratorService.generateChartSvg([], {
      symbol: 'NSE:RELIANCE-EQ',
      status: 'CLOSED',
    });

    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('No historical candlestick data available');
  });

  it('generates a complete valid SVG with candlesticks and trade execution levels', () => {
    const mockTrade = {
      symbol: 'NSE:RELIANCE-EQ',
      direction: 'LONG',
      entryPrice: 2515,
      exitPrice: 2565,
      entryTime: baseEntryTime.toDate(),
      exitTime: baseExitTime.toDate(),
      netPnl: 2500,
      risk: {
        initialStopLoss: 2480,
        plannedTarget: 2600,
      },
      calculated: {
        realizedR: 1.43,
        netPnl: 2500,
      },
    };

    const svg = ChartGeneratorService.generateChartSvg(sampleCandles, mockTrade, {
      resolution: '5',
      width: 960,
      height: 520,
    });

    expect(svg).toContain('<svg width="960" height="520"');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('NSE:RELIANCE-EQ');
    expect(svg).toContain('5m');
    expect(svg).toContain('LONG');
    expect(svg).toContain('ENT: 2515.0');
    expect(svg).toContain('EXIT: 2565.0');
    expect(svg).toContain('SL: 2480.0');
    expect(svg).toContain('TP: 2600.0');
    expect(svg).toContain('⚡ FYERS AUTO CHART');
    expect(svg).toContain('+₹2500.00 (+1.43R)');
  });

  it('properly formats Short trade with Sell marker and rose color palette', () => {
    const mockShortTrade = {
      symbol: 'NSE:NIFTY24OCT24500PE',
      direction: 'SHORT',
      entryPrice: 2550,
      exitPrice: 2515,
      entryTime: baseEntryTime.toDate(),
      exitTime: baseExitTime.toDate(),
      netPnl: 1750,
      risk: {
        initialStopLoss: 2580,
        plannedTarget: 2480,
      },
      calculated: {
        realizedR: 1.17,
        netPnl: 1750,
      },
    };

    const svg = ChartGeneratorService.generateChartSvg(sampleCandles, mockShortTrade, {
      resolution: '5',
    });

    expect(svg).toContain('SHORT');
    expect(svg).toContain('▼ SELL @ 2550.0');
    expect(svg).toContain('SL: 2580.0');
  });

  it('formats candle timestamps and header dates using moment library', () => {
    const mockTrade = {
      symbol: 'NSE:TCS-EQ',
      direction: 'LONG',
      entryPrice: 3500,
      exitPrice: 3550,
      entryTime: moment('2026-10-24T10:00:00.000Z').toDate(),
      exitTime: moment('2026-10-24T11:00:00.000Z').toDate(),
      netPnl: 1200,
    };

    const svg = ChartGeneratorService.generateChartSvg(sampleCandles, mockTrade);

    const expectedHeaderDate = moment(mockTrade.entryTime).format('DD MMM YYYY, HH:mm');
    expect(svg).toContain(expectedHeaderDate);
    expect(svg).toContain('SetupMint Visual Trade Audit');
  });

  it('embeds Excursion HUD box when calculated excursion data is present', () => {
    const mockTrade = {
      symbol: 'NSE:INFY-EQ',
      direction: 'LONG',
      entryPrice: 1800,
      exitPrice: 1840,
      entryTime: baseEntryTime.toDate(),
      exitTime: baseExitTime.toDate(),
      netPnl: 2000,
      calculated: {
        realizedR: 2.0,
        netPnl: 2000,
        excursion: {
          status: 'COMPUTED',
          mfePoints: 45.5,
          maePoints: 12.0,
          mfeR: 2.28,
          maeR: 0.6,
          exitEfficiency: 0.88,
        },
      },
    };

    const svg = ChartGeneratorService.generateChartSvg(sampleCandles, mockTrade);

    expect(svg).toContain('MFE:');
    expect(svg).toContain('+45.5');
    expect(svg).toContain('(+2.3R)');
    expect(svg).toContain('MAE:');
    expect(svg).toContain('-12.0');
    expect(svg).toContain('(-0.6R)');
    expect(svg).toContain('Eff:');
    expect(svg).toContain('88%');
  });
});
