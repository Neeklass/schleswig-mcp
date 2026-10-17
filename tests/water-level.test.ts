import { describe, expect, it, vi } from 'vitest';
import { SOURCE_URL } from '../src/providers/pegelonline.ts';
import {
  getSchleswigWaterLevel,
  waterLevelSchema,
} from '../src/modules/water-level.ts';
import { NOW, stationFixture } from './fixtures.ts';

function fetchJson(body: unknown, status = 200) {
  return vi
    .fn<typeof fetch>()
    .mockImplementation(
      async () => new Response(JSON.stringify(body), { status }),
    );
}

function read(body: unknown, now = NOW) {
  return getSchleswigWaterLevel({ fetch: fetchJson(body), now: () => now });
}

describe('water-level service', () => {
  it('validates and preserves the measurement, station, unit, offset and source', async () => {
    const fetchData = fetchJson(stationFixture());
    const result = await getSchleswigWaterLevel({
      fetch: fetchData,
      now: () => NOW,
    });
    expect(waterLevelSchema.parse(result)).toEqual(result);
    expect(result.measurement).toEqual({
      value: 521,
      unit: 'cm',
      timestamp: '2026-10-14T15:24:00+02:00',
      reference: 'gauge_zero',
    });
    expect(result.freshness).toEqual({
      fetchedAt: NOW.toISOString(),
      ageSeconds: 60,
      isStale: false,
      staleAfterSeconds: 900,
    });
    expect(result.station).toMatchObject({
      name: 'SCHLESWIG',
      number: '9610040',
      water: 'OSTSEE',
    });
    expect(result.source.url).toBe(SOURCE_URL);
    expect(result.notices.join(' ')).toContain('not water depth');
    expect(fetchData).toHaveBeenCalledWith(
      SOURCE_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it.each([
    ['2026-10-14T13:39:00Z', false],
    ['2026-10-14T13:39:00.001Z', true],
    ['2026-10-14T14:24:00Z', true],
  ])('marks freshness at %s as stale=%s', async (time, isStale) => {
    const result = await read(stationFixture(), new Date(time));
    expect(result.freshness.isStale).toBe(isStale);
    expect(
      result.notices.some((notice) => notice.includes('older than 15 minutes')),
    ).toBe(isStale);
  });

  it.each([0, -10])('accepts a finite gauge reading of %s', async (value) => {
    const fixture = stationFixture();
    fixture.timeseries[0]!.currentMeasurement.value = value;
    expect((await read(fixture)).measurement.value).toBe(value);
  });

  it('does not select another parameter when W is absent', async () => {
    const fixture = stationFixture();
    fixture.timeseries[0]!.shortname = 'Q';
    await expect(read(fixture)).rejects.toMatchObject({
      code: 'MEASUREMENT_UNAVAILABLE',
    });
  });

  it.each([undefined, null])(
    'handles an absent measurement (%s)',
    async (measurement) => {
      const fixture = stationFixture();
      const body = {
        ...fixture,
        timeseries: [
          { ...fixture.timeseries[0], currentMeasurement: measurement },
        ],
      };
      await expect(read(body)).rejects.toMatchObject({
        code: 'MEASUREMENT_UNAVAILABLE',
      });
    },
  );

  it.each([undefined, []])(
    'handles absent timeseries (%s)',
    async (timeseries) => {
      await expect(
        read({ ...stationFixture(), timeseries }),
      ).rejects.toMatchObject({ code: 'MEASUREMENT_UNAVAILABLE' });
    },
  );

  it('rejects a different station and duplicate W series', async () => {
    await expect(
      read({ ...stationFixture(), uuid: 'wrong-station' }),
    ).rejects.toMatchObject({ code: 'INVALID_UPSTREAM_RESPONSE' });
    const fixture = stationFixture();
    fixture.timeseries.push(fixture.timeseries[0]!);
    await expect(read(fixture)).rejects.toMatchObject({
      code: 'INVALID_UPSTREAM_RESPONSE',
    });
  });

  it.each([
    { value: '521', timestamp: '2026-10-14T15:24:00+02:00' },
    { value: null, timestamp: '2026-10-14T15:24:00+02:00' },
    { value: 521, timestamp: 'not-a-date' },
    { value: 521, timestamp: '2026-10-14T15:24:00' },
    { value: 521, timestamp: '2026-02-30T15:24:00+02:00' },
  ])('rejects invalid measurement %j', async (currentMeasurement) => {
    const fixture = stationFixture();
    await expect(
      read({
        ...fixture,
        timeseries: [{ ...fixture.timeseries[0], currentMeasurement }],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_UPSTREAM_RESPONSE' });
  });

  it('rejects an unexpected unit', async () => {
    const fixture = stationFixture();
    fixture.timeseries[0]!.unit = 'm';
    await expect(read(fixture)).rejects.toMatchObject({
      code: 'INVALID_UPSTREAM_RESPONSE',
    });
  });

  it('rejects timestamps more than one minute into the future', async () => {
    await expect(
      read(stationFixture(), new Date('2026-10-14T13:22:59Z')),
    ).rejects.toMatchObject({ code: 'INVALID_UPSTREAM_RESPONSE' });
    expect(
      (await read(stationFixture(), new Date('2026-10-14T13:23:30Z'))).freshness
        .ageSeconds,
    ).toBe(0);
  });

  it('carries upstream station notices to clients', async () => {
    const fixture = stationFixture();
    const result = await read({
      ...fixture,
      timeseries: [
        {
          ...fixture.timeseries[0],
          comment: { longDescription: 'Sensor maintenance.' },
        },
      ],
    });
    expect(result.notices).toContain(
      'PEGELONLINE station notice: Sensor maintenance.',
    );
  });

  it('rejects malformed JSON', async () => {
    const fetchData = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{'));
    await expect(
      getSchleswigWaterLevel({ fetch: fetchData }),
    ).rejects.toMatchObject({ code: 'INVALID_UPSTREAM_RESPONSE' });
  });

  it.each([404, 429, 500])('handles upstream HTTP %s', async (status) => {
    await expect(
      getSchleswigWaterLevel({ fetch: fetchJson({}, status) }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
  });

  it('handles a network failure', async () => {
    const fetchData = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('Connection refused'));
    await expect(
      getSchleswigWaterLevel({ fetch: fetchData }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
  });

  it('aborts an upstream request after the deadline', async () => {
    const fetchData: typeof fetch = async (_input, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) throw new Error('Expected a timeout signal.');
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        });
      });
    await expect(
      getSchleswigWaterLevel({ fetch: fetchData, timeoutMs: 10 }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_TIMEOUT' });
  });
});
