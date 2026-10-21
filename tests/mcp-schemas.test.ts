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
import { bathingWaterPageSchema } from '../src/modules/bathing-waters.ts';
import { chargingStationPageSchema } from '../src/modules/car-charging-stations.ts';
import { populationPageSchema } from '../src/modules/population-forecast.ts';
import { NOW, stationFixture } from './fixtures.ts';

const app = createApp(() =>
  getSchleswigWaterLevel({
    fetch: async () => Response.json(stationFixture()),
    now: () => NOW,
  }),
);
const client = new Client({ name: 'schema-regression', version: '1.0.0' });
let tools: Tool[];
// Deprecated single-dataset tools; theme tools are covered in mcp-themes.test.ts.
let legacy: Tool[];
const legacyNames = [
  'get_schleswig_water_level',
  'list_schleswig_addresses',
  'list_schleswig_monuments',
  'list_schleswig_bathing_waters',
  'list_schleswig_charging_stations',
  'list_schleswig_population_forecast',
];
let base: string;
const object = z.record(z.string(), z.unknown());
function validator(schema: unknown) {
  return fromJsonSchema(object.parse(schema))['~standard'];
}

const affectedSchemas = {
  list_schleswig_bathing_waters: bathingWaterPageSchema,
  list_schleswig_charging_stations: chargingStationPageSchema,
  list_schleswig_population_forecast: populationPageSchema,
};
const nullableFields = [
  ['list_schleswig_charging_stations', ['displayName'], 'string'],
  ['list_schleswig_charging_stations', ['address', 'addressSuffix'], 'string'],
  ['list_schleswig_charging_stations', ['locationName'], 'string'],
  ['list_schleswig_charging_stations', ['parkingInformation'], 'string'],
  ['list_schleswig_charging_stations', ['openingHours'], 'string'],
  [
    'list_schleswig_charging_stations',
    ['chargingPoints', 0, 'evseId'],
    'string',
  ],
  [
    'list_schleswig_charging_stations',
    ['chargingPoints', 0, 'publicKey'],
    'string',
  ],
  ['list_schleswig_bathing_waters', ['potentialPollutionSources'], 'string'],
  ['list_schleswig_population_forecast', ['values', 0, 'value'], 'number'],
] as const;

function at(value: unknown, path: readonly (string | number)[]): unknown {
  return path.reduce<unknown>(
    (current, key) =>
      typeof key === 'number'
        ? z.array(z.unknown()).parse(current)[key]
        : object.parse(current)[key],
    value,
  );
}

function schemaPath(path: readonly (string | number)[]): string[] {
  return path.flatMap((key) =>
    typeof key === 'number' ? ['items'] : ['properties', key],
  );
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
  legacy = tools.filter((tool) => legacyNames.includes(tool.name));
});
afterAll(async () => {
  await client.close();
  await app.close();
});

describe('advertised MCP schemas', () => {
  it.each(nullableFields)(
    'preserves required nullable %s %j as an anyOf of %s and null',
    async (name, fieldPath, type) => {
      const tool = tools.find((item) => item.name === name)!;
      const path = ['data', 0, ...fieldPath];
      const field = path.at(-1)!;
      const parentPath = path.slice(0, -1);
      expect(at(tool.outputSchema, schemaPath(path))).toEqual({
        anyOf: [{ type }, { type: 'null' }],
      });
      expect(
        object.parse(at(tool.outputSchema, schemaPath(parentPath))).required,
      ).toContain(field);
      const result = await client.callTool({ name, arguments: { limit: 1 } });
      expect(result.isError).not.toBe(true);
      const output = validator(tool.outputSchema);
      for (const value of [null, '', 'sample', 0, -1, 1.25, false, [], {}]) {
        const page = structuredClone(result.structuredContent);
        const parent = at(page, parentPath);
        if (!parent || typeof parent !== 'object')
          throw new Error('Expected record parent.');
        Reflect.set(parent, field, value);
        const expected = value === null || typeof value === type;
        expect(affectedSchemas[name].safeParse(page).success).toBe(expected);
        expect((await output.validate(page)).issues === undefined).toBe(
          expected,
        );
        Reflect.deleteProperty(parent, field);
        expect(affectedSchemas[name].safeParse(page).success).toBe(false);
        expect((await output.validate(page)).issues).toBeDefined();
      }
    },
  );

  it('changes only the nine nullable type spellings in the affected output schemas', () => {
    for (const [name, schema] of Object.entries(affectedSchemas)) {
      const original = schema['~standard'].jsonSchema.output({
        target: 'draft-2020-12',
      });
      const expected = structuredClone(original);
      for (const [toolName, fieldPath, type] of nullableFields) {
        if (toolName !== name) continue;
        const field = at(expected, schemaPath(['data', 0, ...fieldPath]));
        if (!field || typeof field !== 'object')
          throw new Error('Expected field schema.');
        expect(field).toEqual({ type: [type, 'null'] });
        Reflect.deleteProperty(field, 'type');
        Reflect.set(field, 'anyOf', [{ type }, { type: 'null' }]);
      }
      expect(tools.find((tool) => tool.name === name)!.outputSchema).toEqual(
        expected,
      );
      expect(
        schema['~standard'].jsonSchema.output({ target: 'draft-2020-12' }),
      ).toEqual(original);
    }
  });

  it('registers six closed object contracts and executes all tools with a validating client', async () => {
    expect(legacy.map((tool) => tool.name)).toEqual(legacyNames);
    for (const tool of legacy) {
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
    for (const tool of legacy.slice(1)) {
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
    for (const tool of legacy.slice(1)) {
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
