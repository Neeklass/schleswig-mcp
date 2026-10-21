import { z } from 'zod';
import { WaterLevelError } from '../shared/errors.ts';
import type { WaterLevelReading } from '../modules/water-level.ts';
import { waterLevelDaySchema } from '../modules/models/water-level-history.ts';
import type { WaterLevelDay } from '../modules/models/water-level-history.ts';
import { goldDatasetSchema, uniqueIds } from '../shared/gold-metadata.ts';
import { cachedGold, curatedRoot } from '../shared/gold-reader.ts';

export const STATION_ID = '09370c05-1041-4395-a5d4-b8db6e59c4c8';
export const SOURCE_URL = `https://pegelonline.wsv.de/webservices/rest-api/v2/stations/${STATION_ID}.json?includeTimeseries=true&includeCurrentMeasurement=true`;
// PEGELONLINE serves raw measurements for the last 31 days only.
export const MEASUREMENTS_URL = `https://pegelonline.wsv.de/webservices/rest-api/v2/stations/${STATION_ID}/W/measurements.json?start=P31D`;
export const REQUEST_TIMEOUT_MS = 5_000;

const stationSchema = z.object({
  uuid: z.literal(STATION_ID),
  number: z.string().min(1),
  longname: z.string().min(1),
  water: z.object({ longname: z.string().min(1) }),
  timeseries: z.array(z.looseObject({ shortname: z.string() })).optional(),
});

const timeseriesSchema = z.object({
  shortname: z.literal('W'),
  unit: z.literal('cm'),
  currentMeasurement: z
    .object({
      timestamp: z.iso.datetime({ offset: true }),
      value: z.number(),
    })
    .nullish(),
  comment: z
    .object({
      shortDescription: z.string().optional(),
      longDescription: z.string().optional(),
    })
    .nullish(),
});

export interface PegelonlineOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

async function fetchJson(
  url: string,
  options: PegelonlineOptions,
): Promise<unknown> {
  const fetchData = options.fetch ?? globalThis.fetch;
  const timeout = AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchData(url, {
      headers: { Accept: 'application/json' },
      signal: timeout,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new WaterLevelError('UPSTREAM_UNAVAILABLE');
    }
    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof WaterLevelError) throw error;
    if (timeout.aborted)
      throw new WaterLevelError('UPSTREAM_TIMEOUT', { cause: error });
    if (error instanceof SyntaxError)
      throw new WaterLevelError('INVALID_UPSTREAM_RESPONSE', { cause: error });
    throw new WaterLevelError('UPSTREAM_UNAVAILABLE', { cause: error });
  }
}

export async function fetchSchleswigMeasurement(
  options: PegelonlineOptions = {},
): Promise<WaterLevelReading> {
  const raw = await fetchJson(SOURCE_URL, options);
  const stationResult = stationSchema.safeParse(raw);
  if (!stationResult.success)
    throw new WaterLevelError('INVALID_UPSTREAM_RESPONSE');
  const station = stationResult.data;
  const series =
    station.timeseries?.filter((entry) => entry.shortname === 'W') ?? [];
  if (series.length === 0) throw new WaterLevelError('MEASUREMENT_UNAVAILABLE');
  if (series.length !== 1)
    throw new WaterLevelError('INVALID_UPSTREAM_RESPONSE');

  const timeseries = timeseriesSchema.safeParse(series[0]);
  if (!timeseries.success)
    throw new WaterLevelError('INVALID_UPSTREAM_RESPONSE');
  if (!timeseries.data.currentMeasurement)
    throw new WaterLevelError('MEASUREMENT_UNAVAILABLE');

  const notices = ['PEGELONLINE provides unvalidated raw measurements.'];
  const sourceComment =
    timeseries.data.comment?.longDescription ||
    timeseries.data.comment?.shortDescription;
  if (sourceComment)
    notices.push(`PEGELONLINE station notice: ${sourceComment}`);

  return {
    station: {
      id: station.uuid,
      number: station.number,
      name: station.longname,
      water: station.water.longname,
    },
    measurement: {
      ...timeseries.data.currentMeasurement,
      unit: timeseries.data.unit,
      reference: 'gauge_zero',
    },
    source: {
      name: 'PEGELONLINE',
      url: SOURCE_URL,
      license: 'DL-DE-Zero-2.0',
      licenseUrl: 'https://www.govdata.de/dl-de/zero-2-0',
    },
    notices,
  };
}

// Daily history: collected by the update pipeline, served from a Gold file.

const measurementSeriesSchema = z.array(
  z.object({
    timestamp: z.iso.datetime({ offset: true }),
    value: z.number(),
  }),
);
export type Measurement = z.infer<typeof measurementSeriesSchema>[number];

export async function fetchSchleswigMeasurementSeries(
  options: PegelonlineOptions = {},
): Promise<Measurement[]> {
  const result = measurementSeriesSchema.safeParse(
    await fetchJson(MEASUREMENTS_URL, options),
  );
  if (!result.success) throw new WaterLevelError('INVALID_UPSTREAM_RESPONSE');
  return result.data;
}

const berlinDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
// Calendar date (YYYY-MM-DD) of an instant in Europe/Berlin.
export function berlinDate(instant: Date) {
  return berlinDay.format(instant);
}

// Aggregates complete days only: the oldest day in the 31-day window starts
// mid-day and the current day is still running, so both are skipped.
export function aggregateDailyWaterLevels(
  measurements: Measurement[],
  now: Date,
): WaterLevelDay[] {
  const today = berlinDate(now);
  const days = new Map<string, number[]>();
  for (const { timestamp, value } of measurements) {
    const date = berlinDate(new Date(timestamp));
    const values = days.get(date) ?? [];
    values.push(value);
    days.set(date, values);
  }
  const dates = [...days.keys()].sort();
  const first = dates[0];
  return dates
    .filter((date) => date !== first && date < today)
    .map((date) => {
      const values = days.get(date)!;
      const minimum = Math.min(...values);
      const maximum = Math.max(...values);
      const average =
        values.reduce((sum, item) => sum + item, 0) / values.length;
      const mean = Math.min(
        maximum,
        Math.max(minimum, Math.round(average * 10) / 10),
      );
      return waterLevelDaySchema.parse({
        id: date,
        date,
        unit: 'cm',
        reference: 'gauge_zero',
        minimum,
        mean,
        maximum,
        measurementCount: values.length,
      });
    });
}

export const waterLevelHistoryGoldSchema = goldDatasetSchema(
  waterLevelDaySchema,
  'schleswig-water-level-daily',
  'DL-DE-Zero-2.0',
).superRefine((value, context) => {
  uniqueIds(value.data, (record) => record.id, context);
  const dates = value.data.map((record) => record.date);
  if (dates.some((date, index) => index > 0 && date <= dates[index - 1]!))
    context.addIssue({
      code: 'custom',
      message: 'Days must be in ascending date order.',
      path: ['data'],
    });
  if (value.metadata.dates.dataAsOf !== dates.at(-1))
    context.addIssue({
      code: 'custom',
      message: 'dataAsOf must equal the newest day.',
      path: ['metadata', 'dates', 'dataAsOf'],
    });
});
export type WaterLevelHistoryGold = z.infer<typeof waterLevelHistoryGoldSchema>;

export const getWaterLevelHistoryDataset = cachedGold(
  new URL('pegelonline/water-level-daily.json', curatedRoot),
  waterLevelHistoryGoldSchema,
);
