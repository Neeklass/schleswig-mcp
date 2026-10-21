import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import {
  Client,
  fromJsonSchema,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import type { Tool } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.ts';
import { getSchleswigWaterLevel } from '../src/modules/water-level.ts';
import {
  goldLicenseIds,
  goldLicenseUrls,
  goldMetadataSchema,
} from '../src/shared/gold-metadata.ts';
import { themeTools } from '../mcp/themes.ts';
import { NOW, stationFixture } from './fixtures.ts';

const app = createApp(() =>
  getSchleswigWaterLevel({
    fetch: async () => Response.json(stationFixture()),
    now: () => NOW,
  }),
);
const client = new Client({ name: 'theme-tools', version: '1.0.0' });
let tools: Tool[];
const object = z.record(z.string(), z.unknown());
function validator(schema: unknown) {
  return fromJsonSchema(object.parse(schema))['~standard'];
}

beforeAll(async () => {
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const address = app.server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected TCP address.');
  await client.connect(
    new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${address.port}/mcp`),
    ),
  );
  tools = (await client.listTools()).tools;
});
afterAll(async () => {
  await client.close();
  await app.close();
});

// Theme tool, dataset, equivalent deprecated tool, arguments.
const equivalents = [
  ['query_schleswig_water', 'water-level', 'get_schleswig_water_level', {}],
  [
    'query_schleswig_water',
    'bathing-waters',
    'list_schleswig_bathing_waters',
    { limit: 2 },
  ],
  [
    'query_schleswig_population',
    'population-forecast',
    'list_schleswig_population_forecast',
    { limit: 3, offset: 1 },
  ],
  [
    'query_schleswig_mobility',
    'charging-stations',
    'list_schleswig_charging_stations',
    { q: 'Schleswig', limit: 5 },
  ],
  [
    'query_schleswig_places',
    'addresses',
    'list_schleswig_addresses',
    { limit: 3 },
  ],
  [
    'query_schleswig_places',
    'monuments',
    'list_schleswig_monuments',
    { limit: 3 },
  ],
] as const;

describe('theme tools', () => {
  it('registers five theme tools after the deprecated tools', () => {
    expect(tools.map((tool) => tool.name).slice(6)).toEqual(
      Object.values(themeTools).map((theme) => theme.name),
    );
    for (const tool of tools.slice(0, 6))
      expect(tool.description).toMatch(/^Deprecated: use query_schleswig_/);
  });

  it('advertises closed schemas with a required dataset enum', async () => {
    for (const theme of Object.values(themeTools)) {
      const tool = tools.find((item) => item.name === theme.name)!;
      for (const schema of [tool.inputSchema, tool.outputSchema])
        expect(schema).toMatchObject({
          type: 'object',
          additionalProperties: false,
        });
      expect(tool.inputSchema.required).toEqual(['dataset']);
      expect(tool.inputSchema.properties).toMatchObject({
        dataset: { enum: [...theme.datasets] },
        limit: { type: 'integer', default: 20, minimum: 1, maximum: 100 },
      });
      expect(tool.annotations?.readOnlyHint).toBe(true);
      const input = validator(tool.inputSchema);
      expect((await input.validate({})).issues).toBeDefined();
      expect(
        (await input.validate({ dataset: 'unknown-dataset' })).issues,
      ).toBeDefined();
      expect(
        (await input.validate({ dataset: theme.datasets[0], extra: true }))
          .issues,
      ).toBeDefined();
    }
  });

  it.each(equivalents)(
    '%s with dataset %s returns the same data as %s',
    async (name, dataset, legacyName, args) => {
      const themed = await client.callTool({
        name,
        arguments: { dataset, ...args },
      });
      const legacy = await client.callTool({
        name: legacyName,
        arguments: args,
      });
      expect(themed.isError).not.toBe(true);
      expect(legacy.isError).not.toBe(true);
      expect(themed.structuredContent).toEqual({
        dataset,
        result: legacy.structuredContent,
      });
      const tool = tools.find((item) => item.name === name)!;
      const output = validator(tool.outputSchema);
      expect(
        (await output.validate(themed.structuredContent)).issues,
      ).toBeUndefined();
      expect(
        (
          await output.validate({
            ...object.parse(themed.structuredContent),
            unexpected: true,
          })
        ).issues,
      ).toBeDefined();
    },
  );

  it('serves the daily water-level history like REST', async () => {
    const address = app.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Expected TCP address.');
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/schleswig/water-level-history?limit=2`,
    );
    expect(response.status).toBe(200);
    const themed = await client.callTool({
      name: 'query_schleswig_water',
      arguments: { dataset: 'water-level-history', limit: 2 },
    });
    expect(themed.isError).not.toBe(true);
    expect(themed.structuredContent).toEqual({
      dataset: 'water-level-history',
      result: await response.json(),
    });
    const tool = tools.find((item) => item.name === 'query_schleswig_water')!;
    expect(
      (await validator(tool.outputSchema).validate(themed.structuredContent))
        .issues,
    ).toBeUndefined();
  });

  it.each([
    ['query_schleswig_population', 'population'],
    ['query_schleswig_population', 'population-movement'],
    ['query_schleswig_economy', 'construction'],
    ['query_schleswig_economy', 'tourism'],
    ['query_schleswig_economy', 'municipal-taxes'],
  ])('%s serves official statistics %s like REST', async (name, dataset) => {
    const address = app.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Expected TCP address.');
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/schleswig/${dataset}?limit=3&q=a`,
    );
    expect(response.status).toBe(200);
    const themed = await client.callTool({
      name,
      arguments: { dataset, limit: 3, q: 'a' },
    });
    expect(themed.isError).not.toBe(true);
    expect(themed.structuredContent).toEqual({
      dataset,
      result: await response.json(),
    });
    const tool = tools.find((item) => item.name === name)!;
    expect(
      (await validator(tool.outputSchema).validate(themed.structuredContent))
        .issues,
    ).toBeUndefined();
  });

  it('rejects datasets that belong to another theme', async () => {
    const rejected = await client
      .callTool({
        name: 'query_schleswig_places',
        arguments: { dataset: 'water-level' },
      })
      .then(
        (result) => result.isError === true,
        () => true,
      );
    expect(rejected).toBe(true);
  });
});

describe('snapshot license model', () => {
  it('accepts every supported license only with its canonical URL', async () => {
    const snapshot = object.parse(
      JSON.parse(
        await readFile(
          new URL(
            '../data/curated/opendata-sh/monuments.json',
            import.meta.url,
          ),
          'utf8',
        ),
      ),
    );
    const metadata = goldMetadataSchema.parse(snapshot.metadata);
    for (const id of goldLicenseIds) {
      const license = { ...metadata.license, id, url: goldLicenseUrls[id] };
      expect(
        goldMetadataSchema.safeParse({ ...metadata, license }).success,
      ).toBe(true);
      expect(
        goldMetadataSchema.safeParse({
          ...metadata,
          license: { ...license, url: 'https://example.com/license' },
        }).success,
      ).toBe(false);
    }
    expect(goldLicenseUrls['DL-DE-BY-2.0']).toBe(
      'https://www.govdata.de/dl-de/by-2-0',
    );
  });
});
