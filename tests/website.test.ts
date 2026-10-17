import { once } from 'node:events';
import { readdir } from 'node:fs/promises';
import {
  Client,
  fromJsonSchema,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.ts';
import {
  createOpenApi,
  restDocumentation,
  waterLevelExample,
} from '../api/_lib/openapi.ts';
import { websiteFiles } from '../api/_lib/website.ts';
import { listQuerySchema } from '../src/shared/pagination.ts';

const app = createApp(async () => waterLevelExample);
const client = new Client({ name: 'website-check', version: '1.0.0' });
const document = await createOpenApi();
let base: string;
beforeAll(async () => {
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const address = app.server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected TCP address.');
  base = `http://127.0.0.1:${address.port}`;
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/mcp`)),
  );
});
afterAll(async () => {
  await client.close();
  await app.close();
});

// Validate the OpenAPI objects used here and every embedded schema/example.
const mediaSchema = z.object({
  schema: z.object({ $ref: z.string() }),
  examples: z.object({ sample: z.object({ value: z.unknown() }) }),
});
const operationSchema = z.object({
  get: z.object({
    operationId: z.string().min(1),
    parameters: z.array(
      z.object({
        name: z.enum(['id', 'q', 'limit', 'offset']),
        in: z.literal('query'),
        required: z.literal(false),
        schema: z.record(z.string(), z.unknown()),
      }),
    ),
    responses: z.object({
      '200': z.object({
        content: z.object({ 'application/json': mediaSchema }),
      }),
    }),
  }),
});

describe('public website', () => {
  it.each(Object.keys(websiteFiles))(
    'serves the allowlisted asset %s for GET and HEAD',
    async (path) => {
      const response = await fetch(`${base}${path}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe(
        websiteFiles[path]!.type,
      );
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect((await response.text()).length).toBeGreaterThan(100);
      const head = await fetch(`${base}${path}`, { method: 'HEAD' });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe('');
    },
  );
  it('keeps only explicitly published files in public/', async () => {
    const files = await readdir(new URL('../public/', import.meta.url));
    expect(files.sort()).toEqual(
      Object.values(websiteFiles)
        .map(({ file }) => file)
        .sort(),
    );
  });
  it.each([
    '/src/index.ts',
    '/api/_lib/openapi.ts',
    '/mcp/documentation.html',
    '/dist/src/index.js',
    '/data/curated/geodata-sh/addresses.json',
    '/data/imported/example.csv',
    '/.env',
    '/vercel.json',
    '/package.json',
    '/__proto__',
    '/%2e%2e%2fpackage.json',
  ])('does not expose %s', async (path) => {
    expect((await fetch(`${base}${path}`)).status).toBe(404);
  });
  it('rejects foreign origins and unsupported website methods', async () => {
    expect(
      (
        await fetch(`${base}/docs`, {
          headers: { Origin: 'https://foreign.example' },
        })
      ).status,
    ).toBe(403);
    const response = await fetch(`${base}/docs`, { method: 'POST' });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
    expect((await fetch(`${base}/mcp`)).status).toBe(405);
  });
  it('links the homepage and loads a pinned Scalar client without a proxy', async () => {
    const home = await (await fetch(`${base}/`)).text();
    for (const path of ['/docs', '/mcp-docs', '/openapi.json'])
      expect(home).toContain(`href="${path}"`);
    const html = await (await fetch(`${base}/docs`)).text();
    expect(html).toContain('id="api-reference"');
    expect(html).toContain('src="/docs.js"');
    const js = await (await fetch(`${base}/docs.js`)).text();
    expect(js).toContain('@scalar/api-reference@1.75.0/esm.js');
    expect(js).toContain("url: '/openapi.json'");
    expect(js).not.toContain('proxyUrl');
  });
  it('serves the current generated OpenAPI and MCP examples', async () => {
    expect(await (await fetch(`${base}/openapi.json`)).json()).toEqual(
      document,
    );
    const tools = (await client.listTools()).tools;
    expect(tools).toHaveLength(6);
    const html = await (await fetch(`${base}/mcp-docs`)).text();
    expect(html).not.toContain('<!-- TOOL_REFERENCE -->');
    for (const tool of tools) {
      expect(html).toContain(`id="${tool.name}"`);
      const match = html.match(
        new RegExp(
          `<pre data-tool="${tool.name}"><code>([\\s\\S]*?)</code></pre>`,
        ),
      );
      expect(match).not.toBeNull();
      const example: unknown = JSON.parse(
        match![1]!
          .replaceAll('&lt;', '<')
          .replaceAll('&gt;', '>')
          .replaceAll('&quot;', '"')
          .replaceAll('&#39;', "'")
          .replaceAll('&amp;', '&'),
      );
      const result = await client.callTool({
        name: tool.name,
        arguments: tool.name.startsWith('get_') ? {} : { limit: 1 },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual(example);
    }
  });
});

describe('OpenAPI contract', () => {
  it('uses OpenAPI 3.1 with a relative server and exactly six GET operations', () => {
    expect(document.openapi).toBe('3.1.0');
    expect(document.jsonSchemaDialect).toBe(
      'https://json-schema.org/draft/2020-12/schema',
    );
    expect(document.servers).toEqual([
      { url: '/', description: expect.any(String) },
    ]);
    expect(Object.keys(document.paths)).toHaveLength(6);
    const ids = Object.values(document.paths).map(
      (operation) => operationSchema.parse(operation).get.operationId,
    );
    expect(new Set(ids).size).toBe(6);
  });
  it.each(restDocumentation)(
    'matches live local REST output and schemas for $path',
    async (endpoint) => {
      const path = `/api/v1/schleswig/${endpoint.path}`;
      const { get } = operationSchema.parse(document.paths[path]);
      expect(
        Object.keys(
          z.record(z.string(), z.unknown()).parse(document.paths[path]),
        ),
      ).toEqual(['get']);
      const response = await fetch(
        `${base}${path}${endpoint.path === 'water-level' ? '' : '?limit=1'}`,
      );
      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      const media = get.responses['200'].content['application/json'];
      expect(media.examples.sample.value).toEqual(body);
      expect(endpoint.schema.safeParse(body).success).toBe(true);
      expect(media.schema.$ref).toBe(`#/components/schemas/${endpoint.name}`);
      const schema = document.components.schemas[endpoint.name]!;
      expect(schema).toEqual(z.toJSONSchema(endpoint.schema));
      expect(
        (
          await fromJsonSchema(z.record(z.string(), z.unknown()).parse(schema))[
            '~standard'
          ].validate(body)
        ).issues,
      ).toBeUndefined();
      expect(get.parameters.map(({ name }) => name)).toEqual(
        endpoint.path === 'water-level' ? [] : ['id', 'q', 'limit', 'offset'],
      );
      for (const parameter of get.parameters)
        expect(parameter.schema).toEqual(
          z.toJSONSchema(listQuerySchema.shape[parameter.name], {
            io: 'input',
          }),
        );
    },
  );
  it('documents errors without exposing server internals', async () => {
    const schema = document.components.schemas.Error!;
    for (const [path, status, options] of [
      ['/api/v1/schleswig/addresses?limit=101', 400, {}],
      [
        '/api/v1/schleswig/addresses',
        403,
        { headers: { Origin: 'https://foreign.example' } },
      ],
      ['/api/v1/schleswig/absent', 404, {}],
      ['/api/v1/schleswig/addresses', 405, { method: 'POST' }],
    ] as const) {
      const response = await fetch(`${base}${path}`, options);
      expect(response.status).toBe(status);
      expect(
        (
          await fromJsonSchema(z.record(z.string(), z.unknown()).parse(schema))[
            '~standard'
          ].validate(await response.json())
        ).issues,
      ).toBeUndefined();
    }
  });
});
