import { once } from 'node:events';
import { get } from 'node:http';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WaterLevelError } from '../src/errors.ts';
import type { ErrorCode } from '../src/errors.ts';
import { API_PATH, createApp } from '../src/http.ts';
import { getSchleswigWaterLevel } from '../src/water-level.ts';
import type { GetWaterLevel } from '../src/water-level.ts';
import { NOW, stationFixture } from './fixtures.ts';

const apps: ReturnType<typeof createApp>[] = [];
const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function start(getWaterLevel: GetWaterLevel) {
  const app = createApp(getWaterLevel);
  apps.push(app);
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const address = app.server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected a TCP address.');
  return `http://127.0.0.1:${address.port}`;
}

async function connect(baseUrl: string) {
  const client = new Client({ name: 'schleswig-test', version: '1.0.0' });
  clients.push(client);
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)),
  );
  return client;
}

async function fixtureResult() {
  return getSchleswigWaterLevel({
    fetch: async () => Response.json(stationFixture()),
    now: () => NOW,
  });
}

describe('HTTP API and MCP', () => {
  it('exposes the same structured result over HTTP and the real MCP client', async () => {
    const expected = await fixtureResult();
    const getWaterLevel = vi.fn<GetWaterLevel>().mockResolvedValue(expected);
    const base = await start(getWaterLevel);
    const response = await fetch(`${base}${API_PATH}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual(expected);

    const client = await connect(base);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      'get_schleswig_water_level',
    ]);
    expect(tools.tools[0]?.annotations?.readOnlyHint).toBe(true);
    const result = await client.callTool({
      name: 'get_schleswig_water_level',
      arguments: {},
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual(expected);
    expect(result.content).toEqual([
      { type: 'text', text: JSON.stringify(expected) },
    ]);
    expect(getWaterLevel).toHaveBeenCalledTimes(2);
  });

  it.each<[ErrorCode, number]>([
    ['UPSTREAM_UNAVAILABLE', 502],
    ['UPSTREAM_TIMEOUT', 504],
    ['INVALID_UPSTREAM_RESPONSE', 502],
    ['MEASUREMENT_UNAVAILABLE', 503],
  ])('maps %s to HTTP %s and an MCP tool error', async (code, status) => {
    const base = await start(async () => {
      throw new WaterLevelError(code);
    });
    const response = await fetch(`${base}${API_PATH}`);
    expect(response.status).toBe(status);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ error: { code } });
    const client = await connect(base);
    const result = await client.callTool({
      name: 'get_schleswig_water_level',
      arguments: {},
    });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: 'text', text: JSON.stringify(body) },
    ]);
  });

  it('preserves stale measurements as successful results with a warning', async () => {
    const getWaterLevel = () =>
      getSchleswigWaterLevel({
        fetch: async () => Response.json(stationFixture()),
        now: () => new Date('2026-10-14T14:00:00Z'),
      });
    const base = await start(getWaterLevel);
    const response = await fetch(`${base}${API_PATH}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      freshness: { isStale: true },
    });
    const client = await connect(base);
    expect(
      (await client.callTool({ name: 'get_schleswig_water_level' }))
        .structuredContent,
    ).toMatchObject({ freshness: { isStale: true } });
  });

  it('rejects unknown routes and unsupported API methods without fetching', async () => {
    const getWaterLevel = vi.fn<GetWaterLevel>();
    const base = await start(getWaterLevel);
    expect((await fetch(`${base}/missing`)).status).toBe(404);
    const response = await fetch(`${base}${API_PATH}`, { method: 'POST' });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(getWaterLevel).not.toHaveBeenCalled();
  });

  it('rejects non-local Host and Origin headers', async () => {
    const getWaterLevel = vi.fn<GetWaterLevel>();
    const base = await start(getWaterLevel);
    for (const path of [API_PATH, '/mcp']) {
      const hostStatus = await new Promise<number | undefined>(
        (resolve, reject) => {
          get(
            `${base}${path}`,
            { headers: { Host: 'example.com' } },
            (response) => {
              response.resume();
              resolve(response.statusCode);
            },
          ).on('error', reject);
        },
      );
      expect(hostStatus).toBe(403);
      expect(
        (
          await fetch(`${base}${path}`, {
            headers: { Origin: 'https://example.com' },
          })
        ).status,
      ).toBe(403);
    }
    expect(getWaterLevel).not.toHaveBeenCalled();
  });

  it('rejects malformed MCP input without calling the data service', async () => {
    const getWaterLevel = vi.fn<GetWaterLevel>();
    const base = await start(getWaterLevel);
    const client = await connect(base);
    const result = await client.callTool({
      name: 'get_schleswig_water_level',
      arguments: { station: 'other' },
    });
    expect(result.isError).toBe(true);
    expect(getWaterLevel).not.toHaveBeenCalled();
  });

  it('does not expose internal exception messages', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const base = await start(async () => {
        throw new Error('private implementation detail');
      });
      const response = await fetch(`${base}${API_PATH}`);
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred.',
        },
      });
    } finally {
      log.mockRestore();
    }
  });
});
