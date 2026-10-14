import { z } from 'zod';
import { WaterLevelError } from './errors.ts';

export const STATION_ID = '09370c05-1041-4395-a5d4-b8db6e59c4c8';
export const SOURCE_URL = `https://pegelonline.wsv.de/webservices/rest-api/v2/stations/${STATION_ID}.json?includeTimeseries=true&includeCurrentMeasurement=true`;
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

export async function fetchSchleswigMeasurement(
  options: PegelonlineOptions = {},
) {
  const fetchData = options.fetch ?? globalThis.fetch;
  const timeout = AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  let response: Response;
  let raw: unknown;

  try {
    response = await fetchData(SOURCE_URL, {
      headers: { Accept: 'application/json' },
      signal: timeout,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new WaterLevelError('UPSTREAM_UNAVAILABLE');
    }
    raw = await response.json();
  } catch (error) {
    if (error instanceof WaterLevelError) throw error;
    if (timeout.aborted)
      throw new WaterLevelError('UPSTREAM_TIMEOUT', { cause: error });
    if (error instanceof SyntaxError)
      throw new WaterLevelError('INVALID_UPSTREAM_RESPONSE', { cause: error });
    throw new WaterLevelError('UPSTREAM_UNAVAILABLE', { cause: error });
  }

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

  return {
    station,
    timeseries: timeseries.data,
    measurement: timeseries.data.currentMeasurement,
  };
}
