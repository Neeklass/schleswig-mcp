import { once } from 'node:events';
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
import { goldMetadataSchema } from '../src/shared/gold-metadata.ts';
import { NOW, stationFixture } from './fixtures.ts';

const app = createApp(() =>
  getSchleswigWaterLevel({
    fetch: async () => Response.json(stationFixture()),
    now: () => NOW,
  }),
);
const client = new Client({ name: 'schema-regression', version: '1.0.0' });
let tools: Tool[];
let base: string;
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
  base = `http://127.0.0.1:${address.port}`;
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/mcp`)),
  );
  tools = (await client.listTools()).tools;
});
afterAll(async () => {
  await client.close();
  await app.close();
});

describe('advertised MCP schemas', () => {
  it('registers six closed object contracts and executes all tools with a validating client', async () => {
    expect(tools.map((tool) => tool.name)).toEqual([
      'get_schleswig_water_level',
      'list_schleswig_addresses',
      'list_schleswig_monuments',
      'list_schleswig_bathing_waters',
      'list_schleswig_charging_stations',
      'list_schleswig_population_forecast',
    ]);
    for (const tool of tools) {
      for (const schema of [tool.inputSchema, tool.outputSchema]) {
        expect(schema).toMatchObject({
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          additionalProperties: false,
        });
      }
      const input = validator(tool.inputSchema);
      expect((await input.validate({})).issues).toBeUndefined();
      expect((await input.validate({ unexpected: true })).issues).toBeDefined();
      const result = await client.callTool({ name: tool.name, arguments: {} });
      expect(result.isError).not.toBe(true);
      const output = validator(tool.outputSchema);
      expect(
        (await output.validate(result.structuredContent)).issues,
      ).toBeUndefined();
      expect(
        (
          await output.validate({
            ...object.parse(result.structuredContent),
            unexpected: true,
          })
        ).issues,
      ).toBeDefined();
    }
  });

  it('keeps defaulted list arguments optional while rejecting nulls, coercion and invalid bounds', async () => {
    for (const tool of tools.slice(1)) {
      expect(tool.inputSchema.required ?? []).toEqual([]);
      expect(tool.inputSchema.properties).toMatchObject({
        limit: { type: 'integer', default: 20, minimum: 1, maximum: 100 },
        offset: {
          type: 'integer',
          default: 0,
          minimum: 0,
          maximum: Number.MAX_SAFE_INTEGER,
        },
      });
      const input = validator(tool.inputSchema);
      for (const value of [
        { limit: 0 },
        { limit: 101 },
        { limit: 1.5 },
        { limit: '1' },
        { limit: null },
        { offset: -1 },
        { offset: Number.MAX_SAFE_INTEGER + 1 },
        { id: null },
        { q: '' },
        { q: 'x'.repeat(201) },
      ])
        expect((await input.validate(value)).issues).toBeDefined();
      expect(
        (await input.validate({ limit: 100, offset: Number.MAX_SAFE_INTEGER }))
          .issues,
      ).toBeUndefined();
    }
  });

  it('expresses the closed coordinate tuple without the boolean subschema flagged by Inspector', async () => {
    const original = z.tuple([
      z.literal('utmEasting'),
      z.literal('utmNorthing'),
    ]);
    const revised =
      goldMetadataSchema.shape.projectedCoordinates.unwrap().shape.fields;
    for (const tool of tools.slice(1)) {
      // Read the wire schema, not a separate hand-written tool definition.
      const tuple = z
        .object({
          properties: z.object({
            metadata: z.object({
              properties: z.object({
                projectedCoordinates: z.object({
                  properties: z.object({
                    fields: z.record(z.string(), z.unknown()),
                  }),
                }),
              }),
            }),
          }),
        })
        .parse(tool.outputSchema).properties.metadata.properties
        .projectedCoordinates.properties.fields;
      expect(tuple.items).toEqual({ not: {} });
      expect(tuple.prefixItems).toEqual([
        { type: 'string', const: 'utmEasting' },
        { type: 'string', const: 'utmNorthing' },
      ]);
      const advertised = validator(tuple);
      for (const value of [
        ['utmEasting', 'utmNorthing'],
        [],
        ['utmEasting'],
        ['utmNorthing', 'utmEasting'],
        ['utmEasting', 'utmNorthing', 'extra'],
        ['utmEasting', 'utmNorthing', null],
        ['utmEasting', 1],
        null,
      ]) {
        const expected = original.safeParse(value).success;
        expect(revised.safeParse(value).success).toBe(expected);
        expect((await advertised.validate(value)).issues === undefined).toBe(
          expected,
        );
      }
    }
  });

  it('distinguishes nullable values from omitted required properties in nested output', async () => {
    const tool = tools.find(
      (item) => item.name === 'list_schleswig_bathing_waters',
    )!;
    const result = await client.callTool({
      name: tool.name,
      arguments: { limit: 1 },
    });
    const page = object.parse(result.structuredContent);
    const output = validator(tool.outputSchema);
    const data = z.array(z.record(z.string(), z.unknown())).parse(page.data);
    expect(
      (
        await output.validate({
          ...page,
          data: [{ ...data[0], potentialPollutionSources: null }],
        })
      ).issues,
    ).toBeUndefined();
    const missing = { ...data[0] };
    delete missing.potentialPollutionSources;
    expect(
      (await output.validate({ ...page, data: [missing] })).issues,
    ).toBeDefined();
    expect(
      (
        await output.validate({
          ...page,
          data: [{ ...data[0], longitude: 181 }],
        })
      ).issues,
    ).toBeDefined();
    expect(
      (
        await output.validate({
          ...page,
          data: [{ ...data[0], euRegistrationDate: '2026-02-30' }],
        })
      ).issues,
    ).toBeDefined();
  });

  it('also discovers and executes tools with modern protocol negotiation', async () => {
    const modern = new Client(
      { name: 'modern-regression', version: '1.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );
    try {
      await modern.connect(
        new StreamableHTTPClientTransport(new URL(`${base}/mcp`)),
      );
      expect((await modern.listTools()).tools).toEqual(tools);
      const request = {
        name: 'list_schleswig_addresses',
        arguments: { limit: 1 },
      };
      expect((await modern.callTool(request)).structuredContent).toEqual(
        (await client.callTool(request)).structuredContent,
      );
    } finally {
      await modern.close();
    }
  });
});
