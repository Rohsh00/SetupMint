import { describe, it, expect, beforeAll } from 'vitest';
import { InstrumentClassifier } from '../src/services/instrument-classifier.service.js';
import { HolidayService } from '../src/services/holiday.service.js';
import { getNseHolidaysForYear } from '@tradevault/shared';
import { isNseMonthlyExpiry, isNiftyWeeklyExpiry, isExpiryDay } from '@tradevault/financial-engine';

describe('Dynamic Instrument Classification & Multi-Year Holidays', () => {
  beforeAll(async () => {
    // Load dynamic commodity registry
    await InstrumentClassifier.loadCommodityRegistry();
  });

  describe('Dynamic Instrument Classification (Zero Hardcoded Symbols)', () => {
    it('classifies standard and mini MCX commodities dynamically', () => {
      const crude = InstrumentClassifier.classifySync('CRUDEOILM26OCTFUT');
      expect(crude.assetClass).toBe('COMMODITY');
      expect(crude.exchange).toBe('MCX');
      expect(crude.marketSegment).toBe('MCX');

      const natgas = InstrumentClassifier.classifySync('NATGASMINI26NOVFUT');
      expect(natgas.assetClass).toBe('COMMODITY');
      expect(natgas.exchange).toBe('MCX');

      const gold = InstrumentClassifier.classifySync('GOLDM26OCTFUT');
      expect(gold.assetClass).toBe('COMMODITY');
      expect(gold.exchange).toBe('MCX');

      const silver = InstrumentClassifier.classifySync('SILVERMIC26NOVFUT');
      expect(silver.assetClass).toBe('COMMODITY');
      expect(silver.exchange).toBe('MCX');
    });

    it('classifies newly listed commodities and commodity indices dynamically', () => {
      const cotton = InstrumentClassifier.classifySync('COTTON26NOVFUT');
      expect(cotton.assetClass).toBe('COMMODITY');
      expect(cotton.exchange).toBe('MCX');

      const bulldex = InstrumentClassifier.classifySync('MCXBULLDEX26OCTFUT');
      expect(bulldex.assetClass).toBe('COMMODITY');
      expect(bulldex.exchange).toBe('MCX');
    });

    it('authoritatively classifies by exchange or segment metadata regardless of ticker', () => {
      const customScrip = InstrumentClassifier.classifySync('UNKNOWNCOMMODITY', 'MCX_COM');
      expect(customScrip.assetClass).toBe('COMMODITY');
      expect(customScrip.exchange).toBe('MCX');

      const explicitExchange = InstrumentClassifier.classifySync('MCX:CUSTOMXYZ');
      expect(explicitExchange.assetClass).toBe('COMMODITY');
      expect(explicitExchange.exchange).toBe('MCX');
    });

    it('dynamically classifies equity derivatives without hardcoded stock names', () => {
      const option = InstrumentClassifier.classifySync('RELIANCE24OCT3000CE');
      expect(option.assetClass).toBe('OPTIONS');
      expect(option.exchange).toBe('NSE');
      expect(option.marketSegment).toBe('NSE_FNO');

      const future = InstrumentClassifier.classifySync('TCS24OCTFUT');
      expect(future.assetClass).toBe('FUTURES');
      expect(future.exchange).toBe('NSE');
      expect(future.marketSegment).toBe('NSE_FNO');
    });

    it('dynamically classifies crypto asset pairs by currency suffix', () => {
      const btc = InstrumentClassifier.classifySync('BTCUSDT');
      expect(btc.assetClass).toBe('CRYPTO');
      expect(btc.exchange).toBe('BINANCE');
      expect(btc.marketSegment).toBe('CRYPTO');

      const sol = InstrumentClassifier.classifySync('SOLUSDC');
      expect(sol.assetClass).toBe('CRYPTO');
      expect(sol.exchange).toBe('BINANCE');
    });

    it('harmonizes trade metadata dynamically in harmonizeTradeMeta', async () => {
      const harmonized = await InstrumentClassifier.harmonizeTradeMeta({
        symbol: 'CRUDEOILM26OCTFUT',
        exchange: 'NSE', // Mistyped exchange gets corrected
      });
      expect(harmonized.exchange).toBe('MCX');
      expect(harmonized.assetClass).toBe('COMMODITY');
      expect(harmonized.marketSegment).toBe('MCX');
    });
  });

  describe('Dynamic Multi-Year NSE Holiday System', () => {
    it('retrieves official trading holidays dynamically for any specified year', () => {
      const holidays2024 = getNseHolidaysForYear(2024);
      expect(holidays2024.length).toBeGreaterThan(10);
      expect(holidays2024).toContain('2024-01-26'); // Republic Day
      expect(holidays2024).toContain('2024-03-08'); // Mahashivratri

      const holidays2025 = getNseHolidaysForYear(2025);
      expect(holidays2025.length).toBeGreaterThan(10);
      expect(holidays2025).toContain('2025-08-15'); // Independence Day
      expect(holidays2025).toContain('2025-12-25'); // Christmas

      const holidays2026 = getNseHolidaysForYear(2026);
      expect(holidays2026.length).toBeGreaterThan(10);
      expect(holidays2026).toContain('2026-10-20'); // Dussehra

      const holidays2027 = getNseHolidaysForYear(2027);
      expect(holidays2027.length).toBeGreaterThan(10);
      expect(holidays2027).toContain('2027-01-26');
    });

    it('evaluates weekly and monthly expiries dynamically based on trade year', () => {
      // 2026-10-20 is Dussehra holiday in 2026 -> moves weekly expiry to Mon 2026-10-19
      expect(isNiftyWeeklyExpiry('2026-10-19')).toBe(true);
      expect(isNiftyWeeklyExpiry('2026-10-20')).toBe(false);

      // 2026-11-24 is Guru Nanak Jayanti holiday in 2026 -> moves monthly expiry to Mon 2026-11-23
      expect(isNseMonthlyExpiry('2026-11-23')).toBe(true);
      expect(isNseMonthlyExpiry('2026-11-24')).toBe(false);
    });

    it('HolidayService checks holidays synchronously and through cache', () => {
      expect(HolidayService.isHolidaySync('2026-01-26', 'NSE')).toBe(true);
      expect(HolidayService.isHolidaySync('2025-12-25', 'NSE')).toBe(true);
      expect(HolidayService.isHolidaySync('2026-05-15', 'NSE')).toBe(false);
    });
  });
});
