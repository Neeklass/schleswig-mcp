import { fromJsonSchema } from '@modelcontextprotocol/client';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { mcpOutputSchema } from '../mcp/output-schema.ts';
import { chargingStationPageSchema } from '../src/modules/car-charging-stations.ts';

describe('MCP output schema serialization', () => {
  it('retains exact input/output types, the original validator and input serialization', async () => {
    const wrapped = mcpOutputSchema(chargingStationPageSchema);
    expectTypeOf(wrapped['~standard'].types).toEqualTypeOf(
      chargingStationPageSchema['~standard'].types,
    );
    expect(wrapped['~standard'].validate).toBe(
      chargingStationPageSchema['~standard'].validate,
    );
    expect(wrapped['~standard'].jsonSchema.input).toBe(
      chargingStationPageSchema['~standard'].jsonSchema.input,
    );
    const schema = z
      .strictObject({ value: z.number().nullable() })
      .superRefine((record, context) => {
        if (record.value !== null && record.value < 0)
          context.addIssue({
            code: 'custom',
            message: 'Negative values are not allowed.',
          });
      });
    for (const value of [
      { value: null },
      { value: 0 },
      { value: -1 },
      {},
      { value: '0' },
    ]) {
      expect(
        await mcpOutputSchema(schema)['~standard'].validate(value),
      ).toEqual(await schema['~standard'].validate(value));
    }
  });

  it('preserves sibling constraints, existing compositions, annotations and references', async () => {
    const schema = z
      .strictObject({
        value: z
          .string()
          .nullable()
          .meta({
            type: ['string', 'null'],
            anyOf: [{ const: 'yes' }, { type: 'null' }],
            allOf: [{ not: { const: 'no' } }],
            default: null,
            description: 'A nullable constrained value.',
            examples: [{ type: ['string', 'null'] }],
          }),
        nested: z.array(z.string().nullable()),
        bounded: z.number().min(0).nullable(),
      })
      .meta({
        $defs: { nullableText: { type: ['string', 'null'] } },
        allOf: [{ properties: { value: { $ref: '#/$defs/nullableText' } } }],
      });
    const options = { target: 'draft-2020-12' };
    const original = schema['~standard'].jsonSchema.output(options);
    const wrapped = mcpOutputSchema(schema)['~standard'];
    const output = wrapped.jsonSchema.output(options);
    expect(schema['~standard'].jsonSchema.output(options)).toEqual(original);
    expect(wrapped.jsonSchema.input(options)).toEqual(
      schema['~standard'].jsonSchema.input(options),
    );
    expect(output).toMatchObject({
      additionalProperties: false,
      required: ['value', 'nested', 'bounded'],
      $defs: {
        nullableText: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      },
      allOf: [{ properties: { value: { $ref: '#/$defs/nullableText' } } }],
      properties: {
        value: {
          anyOf: [{ const: 'yes' }, { type: 'null' }],
          allOf: [
            { not: { const: 'no' } },
            { anyOf: [{ type: 'string' }, { type: 'null' }] },
          ],
          default: null,
          description: 'A nullable constrained value.',
          examples: [{ type: ['string', 'null'] }],
        },
        nested: { items: { anyOf: [{ type: 'string' }, { type: 'null' }] } },
      },
    });
    const before = fromJsonSchema(original)['~standard'];
    const after = fromJsonSchema(output)['~standard'];
    for (const value of [null, 'yes', 'no', '', 1, false, [], {}]) {
      for (const bounded of [null, 0, -1]) {
        const record = { value, nested: [null, 'text'], bounded };
        expect((await after.validate(record)).issues === undefined).toBe(
          (await before.validate(record)).issues === undefined,
        );
      }
    }
  });
});
