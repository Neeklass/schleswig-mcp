import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  aggregateDailyWaterLevels,
  berlinDate,
  fetchSchleswigMeasurementSeries,
  MEASUREMENTS_URL,
  waterLevelHistoryGoldSchema,
} from '../src/providers/pegelonline.ts';
import type { Measurement } from '../src/providers/pegelonline.ts';
import type { WaterLevelDay } from '../src/modules/models/water-level-history.ts';
import { curatedRoot } from '../src/shared/gold-reader.ts';
import {
  buildWaterLevelHistoryGold,
  mergeWaterLevelDays,
} from '../scripts/water-level-history.ts';

// Synthetic hourly series in UTC, crossing the end of daylight saving time
// (2026-10-25: 25 hours in Europe/Berlin).
function hourlySeries(from: string, hours: number): Measurement[] {
  const start = Date.parse(from);
  return Array.from({ length: hours }, (_, index) => ({
    timestamp: new Date(start + index * 3_600_000).toISOString(),
    value: 500 + (index % 10),
  }));
}

function day(date: string, mean = 510): WaterLevelDay {
  return {
    id: date,
    date,
    unit: 'cm',
    reference: 'gauge_zero',
    minimum: mean - 5,
    mean,
    maximum: mean + 5,
    measurementCount: 1440,
  };
}

describe('daily water-level aggregation', () => {
  it('uses Berlin calendar days and skips the partial first and current day', () => {
    const days = aggregateDailyWaterLevels(
      hourlySeries('2026-10-23T10:30:00Z', 92),
      new Date('2026-10-27T07:00:00Z'),
    );
    expect(days.map((item) => [item.date, item.measurementCount])).toEqual([
      ['2026-10-24', 24],
      ['2026-10-25', 25],
      ['2026-10-26', 24],
    ]);
    for (const item of days) {
      expect(item).toMatchObject({ unit: 'cm', reference: 'gauge_zero' });
      expect(item.minimum).toBe(500);
      expect(item.maximum).toBe(509);
    }
  });

  it('assigns UTC timestamps near midnight to the Berlin date', () => {
    expect(berlinDate(new Date('2026-10-23T22:30:00Z'))).toBe('2026-10-24');
    expect(berlinDate(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });

  it('rounds the mean to 0.1 cm and keeps measurement gaps visible', () => {
    const days = aggregateDailyWaterLevels(
      [
        { timestamp: '2026-10-01T23:00:00+02:00', value: 400 },
        { timestamp: '2026-10-02T08:00:00+02:00', value: 501 },
        { timestamp: '2026-10-02T09:00:00+02:00', value: 502 },
        { timestamp: '2026-10-02T10:00:00+02:00', value: 502 },
        { timestamp: '2026-10-03T08:00:00+02:00', value: 600 },
      ],
      new Date('2026-10-03T12:00:00+02:00'),
    );
    expect(days).toEqual([
      {
        id: '2026-10-02',
        date: '2026-10-02',
        unit: 'cm',
        reference: 'gauge_zero',
        minimum: 501,
        mean: 501.7,
        maximum: 502,
        measurementCount: 3,
      },
    ]);
  });

  it('returns no days when the window holds no complete day', () => {
    expect(
      aggregateDailyWaterLevels(
        hourlySeries('2026-10-27T00:30:00Z', 3),
        new Date('2026-10-27T07:00:00Z'),
      ),
    ).toEqual([]);
  });
});

describe('PEGELONLINE measurement series', () => {
  it('requests the 31-day W series and validates it', async () => {
    const urls: string[] = [];
    const series = await fetchSchleswigMeasurementSeries({
      fetch: async (url) => {
        urls.push(String(url));
        return Response.json([
          { timestamp: '2026-10-02T08:00:00+02:00', value: 501 },
        ]);
      },
    });
    expect(urls).toEqual([MEASUREMENTS_URL]);
    expect(MEASUREMENTS_URL).toMatch(/\/W\/measurements\.json\?start=P31D$/);
    expect(series).toHaveLength(1);
  });

  it.each([
    [{ timestamp: '2026-10-02 08:00', value: 501 }],
    [{ timestamp: '2026-10-02T08:00:00+02:00', value: null }],
    [{ value: 501 }],
  ])('rejects invalid measurements (%j)', async (entry) => {
    await expect(
      fetchSchleswigMeasurementSeries({
        fetch: async () => Response.json([entry]),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_UPSTREAM_RESPONSE' });
  });
});

describe('append-only history', () => {
  it('adds new days, never rewrites stored days and reports conflicts', () => {
    const result = mergeWaterLevelDays(
      [day('2026-10-02'), day('2026-10-03')],
      [day('2026-10-04')],
      [day('2026-10-03', 520), day('2026-10-05'), day('2026-10-01')],
    );
    expect(result.days.map((item) => item.date)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
    ]);
    expect(result.days[2]!.mean).toBe(510);
    expect(result.added).toEqual(['2026-10-01', '2026-10-04', '2026-10-05']);
    expect(result.conflicts).toEqual(['2026-10-03']);
  });

  it('reports nothing new when the source repeats stored days', () => {
    const result = mergeWaterLevelDays(
      [day('2026-10-02')],
      [day('2026-10-02')],
    );
    expect(result.added).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });
});

describe('daily water-level Gold', () => {
  it('builds valid metadata with DL-DE-Zero and the newest day as dataAsOf', () => {
    const gold = buildWaterLevelHistoryGold(
      [day('2026-10-02'), day('2026-10-03')],
      '2026-10-04T05:00:00.000Z',
    );
    expect(gold.metadata).toMatchObject({
      id: 'schleswig-water-level-daily',
      recordCount: 2,
      license: { id: 'DL-DE-Zero-2.0' },
      dates: {
        dataAsOf: '2026-10-03',
        retrievedAt: '2026-10-04T05:00:00.000Z',
      },
      temporalCoverage: { years: [2026] },
    });
  });

  it('rejects unordered, duplicate or inconsistent days', () => {
    const gold = buildWaterLevelHistoryGold(
      [day('2026-10-02'), day('2026-10-03')],
      '2026-10-04T05:00:00.000Z',
    );
    for (const data of [
      [day('2026-10-03'), day('2026-10-02')],
      [day('2026-10-03'), day('2026-10-03')],
      [day('2026-10-02'), { ...day('2026-10-03'), id: '2026-10-04' }],
      [day('2026-10-02'), { ...day('2026-10-03'), mean: 600 }],
    ])
      expect(
        waterLevelHistoryGoldSchema.safeParse({ ...gold, data }).success,
      ).toBe(false);
    expect(
      waterLevelHistoryGoldSchema.safeParse({
        ...gold,
        metadata: {
          ...gold.metadata,
          dates: { ...gold.metadata.dates, dataAsOf: '2026-10-02' },
        },
      }).success,
    ).toBe(false);
  });

  it('validates the collected Gold file', async () => {
    const gold = waterLevelHistoryGoldSchema.parse(
      JSON.parse(
        await readFile(
          new URL('pegelonline/water-level-daily.json', curatedRoot),
          'utf8',
        ),
      ),
    );
    expect(gold.data.length).toBeGreaterThan(0);
    expect(gold.metadata.dates.retrievedAt).not.toBeNull();
    const collectedOn = berlinDate(new Date(gold.metadata.dates.retrievedAt!));
    for (const item of gold.data) expect(item.date < collectedOn).toBe(true);
  });
});
