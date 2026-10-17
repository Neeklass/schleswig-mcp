import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { getSchleswigWaterLevel } from '../src/modules/water-level.ts';
import type { GetWaterLevel } from '../src/modules/water-level.ts';
import { listSchleswigAddresses } from '../src/modules/addresses.ts';
import { listSchleswigMonuments } from '../src/modules/monuments.ts';
import { listSchleswigBathingWaters } from '../src/modules/bathing-waters.ts';
import { listSchleswigChargingStations } from '../src/modules/car-charging-stations.ts';
import { listSchleswigPopulationForecast } from '../src/modules/population-forecast.ts';
import { listQuerySchema } from '../src/shared/pagination.ts';
import type { ListQuery } from '../src/shared/pagination.ts';
import { publicError } from '../src/shared/errors.ts';
import { deploymentOrigin } from '../src/shared/deployment.ts';
import { serveWebsite } from './_lib/website.ts';

export const API_PREFIX = '/api/v1/schleswig/';
export const API_PATH = `${API_PREFIX}water-level`;
const routes: Record<string, (query: ListQuery) => Promise<unknown>> = {
  addresses: listSchleswigAddresses,
  monuments: listSchleswigMonuments,
  'bathing-waters': listSchleswigBathingWaters,
  'charging-stations': listSchleswigChargingStations,
  'population-forecast': listSchleswigPopulationForecast,
};
const errorStatuses = {
  UPSTREAM_UNAVAILABLE: 502,
  UPSTREAM_TIMEOUT: 504,
  INVALID_UPSTREAM_RESPONSE: 502,
  MEASUREMENT_UNAVAILABLE: 503,
  SOURCE_UNAVAILABLE: 503,
  SOURCE_TIMEOUT: 504,
  INVALID_SOURCE_DATA: 503,
  DATA_NOT_FOUND: 503,
  INTERNAL_ERROR: 500,
} as const;

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}
function failure(
  response: ServerResponse,
  status: number,
  code: string,
  message: string,
) {
  json(response, status, { error: { code, message } });
}
function allowed(request: IncomingMessage, origin?: string) {
  try {
    const host = request.headers.host;
    if (!host || /[\s/@?#\\]/.test(host)) return false;
    const hostname = new URL(`http://${host}`).hostname;
    const local = ['localhost', '127.0.0.1', '[::1]'];
    if (
      origin ? hostname !== new URL(origin).hostname : !local.includes(hostname)
    )
      return false;
    const incoming = request.headers.origin;
    if (!incoming) return true;
    const parsed = new URL(incoming);
    if (parsed.origin !== incoming) return false;
    return origin
      ? incoming === origin
      : local.includes(parsed.hostname) &&
          ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}
function parseQuery(parameters: URLSearchParams) {
  const values: Record<string, unknown> = {};
  for (const [key, value] of parameters) {
    if (!Object.hasOwn(listQuerySchema.shape, key))
      throw new Error('Unknown query parameter.');
    if (Object.hasOwn(values, key))
      throw new Error('Duplicate query parameter.');
    if (key === 'limit' || key === 'offset') {
      if (!/^\d+$/.test(value))
        throw new Error('Expected a nonnegative integer.');
      values[key] = Number(value);
    } else values[key] = value;
  }
  return listQuerySchema.parse(values);
}

export function createRestHandler(
  getWaterLevel: GetWaterLevel = getSchleswigWaterLevel,
  origin?: string,
) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const target = request.url ?? '/';
      let url: URL;
      try {
        if (
          !target.startsWith('/') ||
          target.startsWith('//') ||
          target.length > 2048 ||
          target.includes('\\')
        )
          throw new Error('Invalid target.');
        url = new URL(target, 'http://localhost');
      } catch {
        failure(response, 400, 'BAD_REQUEST', 'Invalid request target.');
        return;
      }
      if (!allowed(request, origin)) {
        failure(response, 403, 'FORBIDDEN', 'Host or Origin is not allowed.');
        return;
      }
      if (await serveWebsite(request, response, url.pathname)) return;
      const name = url.pathname.startsWith(API_PREFIX)
        ? url.pathname.slice(API_PREFIX.length)
        : '';
      const list = Object.hasOwn(routes, name) ? routes[name] : undefined;
      if (name !== 'water-level' && !list) {
        failure(response, 404, 'NOT_FOUND', 'Route not found.');
        return;
      }
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        failure(
          response,
          405,
          'METHOD_NOT_ALLOWED',
          'Use GET for this endpoint.',
        );
        return;
      }
      let query: ListQuery;
      try {
        query =
          name === 'water-level'
            ? z.strictObject({}).parse(Object.fromEntries(url.searchParams))
            : parseQuery(url.searchParams);
      } catch {
        failure(
          response,
          400,
          'BAD_REQUEST',
          'Invalid query parameters. Use id, q, limit (1-100), and offset (0 or greater) for dataset lists; water-level accepts none.',
        );
        return;
      }
      json(response, 200, list ? await list(query) : await getWaterLevel());
    } catch (error) {
      const body = publicError(error);
      if (body.error.code === 'INTERNAL_ERROR') console.error(error);
      if (!response.headersSent && !response.destroyed)
        json(response, errorStatuses[body.error.code], body);
      else response.destroy();
    }
  };
}

export default createRestHandler(getSchleswigWaterLevel, deploymentOrigin());
