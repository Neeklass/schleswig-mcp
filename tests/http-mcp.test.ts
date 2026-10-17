import { once } from 'node:events';
import { get } from 'node:http';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WaterLevelError } from '../src/shared/errors.ts';
import type { ErrorCode } from '../src/shared/errors.ts';
import { API_PATH } from '../api/index.ts';
import { createApp } from '../src/app.ts';
import { getSchleswigWaterLevel } from '../src/modules/water-level.ts';
import type { GetWaterLevel } from '../src/modules/water-level.ts';
import { NOW, stationFixture } from './fixtures.ts';
import * as addressProvider from '../src/providers/geodata.ts';
import { DatasetError } from '../src/shared/dataset-io.ts';
import { createMcpEndpoint } from '../mcp/index.ts';
import { createServer } from 'node:http';

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
  it.each([
    ['addresses', 'list_schleswig_addresses', 7619],
    ['monuments', 'list_schleswig_monuments', 251],
    ['bathing-waters', 'list_schleswig_bathing_waters', 2],
    ['charging-stations', 'list_schleswig_charging_stations', 61],
    ['population-forecast', 'list_schleswig_population_forecast', 39],
  ])(
    'serves the same bounded %s page and metadata over both protocols',
    async (route, tool, total) => {
      const getWaterLevel = vi.fn<GetWaterLevel>();
      const base = await start(getWaterLevel);
      const response = await fetch(
        `${base}/api/v1/schleswig/${route}?limit=1&offset=1`,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        metadata: { municipality: { ags: '01059075' } },
        pagination: { limit: 1, offset: 1, total, returned: 1 },
      });
      const client = await connect(base);
      const result = await client.callTool({
        name: String(tool),
        arguments: { limit: 1, offset: 1 },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual(body);
      expect(
        (await fetch(`${base}/api/v1/schleswig/${route}?limit=101`)).status,
      ).toBe(400);
      expect(
        (
          await client.callTool({
            name: String(tool),
            arguments: { limit: 101 },
          })
        ).isError,
      ).toBe(true);
      const last = await fetch(
        `${base}/api/v1/schleswig/${route}?offset=${Number(total) - 1}&limit=100`,
      );
      const lastBody: unknown = await last.json();
      expect(lastBody).toMatchObject({
        pagination: { returned: 1, nextOffset: null },
      });
      expect(
        (
          await client.callTool({
            name: String(tool),
            arguments: { offset: Number(total) - 1, limit: 100 },
          })
        ).structuredContent,
      ).toEqual(lastBody);
      expect(getWaterLevel).not.toHaveBeenCalled();
    },
  );

  it.each([
    'limit=101',
    'limit=0',
    'limit=1.5',
    'limit=',
    'limit=1e2',
    'limit=1&limit=2',
    'offset=-1',
    'offset=9007199254740992',
    'unknown=x',
    '__proto__=x',
    'constructor=x',
    'q=',
    'id=',
  ])('rejects invalid REST query %s', async (query) => {
    const base = await start(vi.fn<GetWaterLevel>());
    const response = await fetch(`${base}/api/v1/schleswig/addresses?${query}`);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'BAD_REQUEST' },
    });
  });

  it('rejects water-level query parameters and keeps empty search results successful', async () => {
    const getWaterLevel = vi.fn<GetWaterLevel>();
    const base = await start(getWaterLevel);
    expect((await fetch(`${base}${API_PATH}?station=other`)).status).toBe(400);
    const response = await fetch(
      `${base}/api/v1/schleswig/addresses?id=missing`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: [],
      pagination: { total: 0, nextOffset: null },
    });
    expect(getWaterLevel).not.toHaveBeenCalled();
  });

  it.each([
    { limit: 101 },
    { limit: '1' },
    { offset: -1 },
    { q: '' },
    { unknown: true },
  ])('validates MCP list input %j', async (args) => {
    const base = await start(vi.fn<GetWaterLevel>());
    const client = await connect(base);
    expect(
      (
        await client.callTool({
          name: 'list_schleswig_addresses',
          arguments: args,
        })
      ).isError,
    ).toBe(true);
  });

  it.each([
    'DATA_NOT_FOUND',
    'INVALID_SOURCE_DATA',
    'SOURCE_UNAVAILABLE',
  ] as const)('returns safe %s errors over REST and MCP', async (code) => {
    const spy = vi
      .spyOn(addressProvider, 'getAddressDataset')
      .mockRejectedValue(
        new DatasetError(code, 'private path or parser detail'),
      );
    try {
      const base = await start(vi.fn<GetWaterLevel>());
      const response = await fetch(`${base}/api/v1/schleswig/addresses`);
      expect(response.status).toBe(503);
      const body: unknown = await response.json();
      expect(body).toMatchObject({ error: { code } });
      expect(JSON.stringify(body)).not.toContain('private');
      const client = await connect(base);
      const result = await client.callTool({
        name: 'list_schleswig_addresses',
        arguments: {},
      });
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        { type: 'text', text: JSON.stringify(body) },
      ]);
    } finally {
      spy.mockRestore();
    }
  });

  it('limits MCP request bodies', async () => {
    const base = await start(vi.fn<GetWaterLevel>());
    const response = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ padding: 'x'.repeat(65_536) }),
    });
    expect(response.status).toBe(413);
  });

  it('keeps stateless GET/DELETE behavior and the Vercel MCP alias compatible', async () => {
    const getWaterLevel = vi.fn<GetWaterLevel>();
    const base = await start(getWaterLevel);
    for (const path of ['/mcp', '/api/mcp']) {
      for (const method of ['GET', 'DELETE']) {
        expect(
          (
            await fetch(`${base}${path}`, {
              method,
              headers: { Accept: 'application/json, text/event-stream' },
            })
          ).status,
        ).toBe(405);
      }
    }
    const client = new Client({ name: 'vercel-alias-test', version: '1.0.0' });
    clients.push(client);
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`)),
    );
    expect((await client.listTools()).tools).toHaveLength(6);
    expect(
      (
        await client.callTool({
          name: 'list_schleswig_addresses',
          arguments: { limit: 1 },
        })
      ).isError,
    ).not.toBe(true);
    expect(getWaterLevel).not.toHaveBeenCalled();
  });

  it.each([
    'null',
    'https://localhost.attacker.invalid',
    'https://user@localhost',
    'https://localhost/path',
  ])('rejects unsafe Origin %s on both transports', async (origin) => {
    const base = await start(vi.fn<GetWaterLevel>());
    for (const path of [API_PATH, '/mcp']) {
      expect(
        (await fetch(`${base}${path}`, { headers: { Origin: origin } })).status,
      ).toBe(403);
    }
  });

  it('accepts a configured public Host and same origin, and rejects a different origin', async () => {
    const app = createApp(fixtureResult, 'https://schleswig.example');
    apps.push(app);
    app.server.listen(0, '127.0.0.1');
    await once(app.server, 'listening');
    const address = app.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Expected TCP address.');
    for (const [path, origin, expected] of [
      [API_PATH, 'https://schleswig.example', 200],
      [API_PATH, 'https://evil.example', 403],
      ['/mcp', 'https://schleswig.example', 405],
      ['/mcp', 'https://evil.example', 403],
      ['/mcp', 'http://schleswig.example', 403],
      ['/mcp', 'https://schleswig.example:8443', 403],
    ] as const) {
      const status = await new Promise<number | undefined>(
        (resolve, reject) => {
          get(
            `http://127.0.0.1:${address.port}${path}`,
            { headers: { Host: 'schleswig.example', Origin: origin } },
            (response) => {
              response.resume();
              resolve(response.statusCode);
            },
          ).on('error', reject);
        },
      );
      expect(status).toBe(expected);
    }
  });

  it('supports Vercel-style pre-parsed MCP request bodies through the minimal entry point', async () => {
    const endpoint = createMcpEndpoint(fixtureResult);
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        void endpoint.handle(
          Object.assign(request, {
            body: text ? (JSON.parse(text) as unknown) : undefined,
          }),
          response,
        );
      });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Expected TCP address.');
    try {
      const client = await connect(`http://127.0.0.1:${address.port}`);
      const result = await client.callTool({
        name: 'list_schleswig_addresses',
        arguments: { limit: 1 },
      });
      expect(result.isError).not.toBe(true);
    } finally {
      await endpoint.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
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
      'list_schleswig_addresses',
      'list_schleswig_monuments',
      'list_schleswig_bathing_waters',
      'list_schleswig_charging_stations',
      'list_schleswig_population_forecast',
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

  it('keeps REST access errors in the REST envelope and MCP access errors in JSON-RPC', async () => {
    const getWaterLevel = vi.fn<GetWaterLevel>();
    const base = await start(getWaterLevel);
    for (const header of ['Host', 'Origin']) {
      const value = header === 'Host' ? 'example.com' : 'https://example.com';
      for (const path of [API_PATH, '/mcp']) {
        const result = await new Promise<{
          status: number | undefined;
          body: unknown;
        }>((resolve, reject) => {
          get(
            `${base}${path}`,
            { headers: { [header]: value } },
            (response) => {
              let body = '';
              response.on('data', (chunk: Buffer) => {
                body += chunk.toString();
              });
              response.on('end', () =>
                resolve({
                  status: response.statusCode,
                  body: JSON.parse(body) as unknown,
                }),
              );
            },
          ).on('error', reject);
        });
        expect(result.status).toBe(403);
        expect(result.body).toMatchObject(
          path === '/mcp'
            ? { jsonrpc: '2.0', error: { code: -32000 }, id: null }
            : { error: { code: 'FORBIDDEN' } },
        );
        if (path === API_PATH)
          expect(result.body).not.toHaveProperty('jsonrpc');
      }
    }
    expect(getWaterLevel).not.toHaveBeenCalled();
  });

  it('classifies an invalid request target as a client error', async () => {
    const getWaterLevel = vi.fn<GetWaterLevel>();
    const base = new URL(await start(getWaterLevel));
    const status = await new Promise<number | undefined>((resolve, reject) => {
      get(
        { hostname: base.hostname, port: base.port, path: '//[' },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      ).on('error', reject);
    });
    expect(status).toBe(400);
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
