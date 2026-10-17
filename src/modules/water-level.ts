import { z } from 'zod';
import { WaterLevelError } from '../shared/errors.ts';
import {
  fetchSchleswigMeasurement,
  STATION_ID,
} from '../providers/pegelonline.ts';
import type { PegelonlineOptions } from '../providers/pegelonline.ts';

export const STALE_AFTER_SECONDS = 15 * 60;
export const FUTURE_TOLERANCE_SECONDS = 60;

export const waterLevelSchema = z.object({
  station: z.object({
    id: z.literal(STATION_ID),
    number: z.string(),
    name: z.string(),
    water: z.string(),
  }),
  measurement: z.object({
    value: z.number(),
    unit: z.literal('cm'),
    timestamp: z.iso.datetime({ offset: true }),
    reference: z.literal('gauge_zero'),
  }),
  freshness: z.object({
    fetchedAt: z.iso.datetime(),
    ageSeconds: z.number().int().nonnegative(),
    isStale: z.boolean(),
    staleAfterSeconds: z.number().int().positive(),
  }),
  source: z.object({
    name: z.literal('PEGELONLINE'),
    url: z.url(),
    license: z.literal('DL-DE-Zero-2.0'),
    licenseUrl: z.url(),
  }),
  notices: z.array(z.string()),
});

export type WaterLevel = z.infer<typeof waterLevelSchema>;
export type WaterLevelReading = Omit<WaterLevel, 'freshness'>;
export type GetWaterLevel = () => Promise<WaterLevel>;

export async function getSchleswigWaterLevel(
  options: PegelonlineOptions & { now?: () => Date } = {},
): Promise<WaterLevel> {
  const reading = await fetchSchleswigMeasurement(options);
  const fetchedAt = (options.now ?? (() => new Date()))();
  const ageMs = fetchedAt.getTime() - Date.parse(reading.measurement.timestamp);
  if (ageMs < -FUTURE_TOLERANCE_SECONDS * 1_000) {
    throw new WaterLevelError('INVALID_UPSTREAM_RESPONSE');
  }
  const ageSeconds = Math.max(0, Math.floor(ageMs / 1_000));
  const isStale = ageMs > STALE_AFTER_SECONDS * 1_000;
  const notices = [
    'Water level relative to the station gauge zero; this is not water depth.',
    ...reading.notices,
  ];
  if (isStale)
    notices.push('The latest available measurement is older than 15 minutes.');
  return waterLevelSchema.parse({
    ...reading,
    freshness: {
      fetchedAt: fetchedAt.toISOString(),
      ageSeconds,
      isStale,
      staleAfterSeconds: STALE_AFTER_SECONDS,
    },
    notices,
  });
}
