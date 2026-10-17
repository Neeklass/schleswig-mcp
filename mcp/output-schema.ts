import type { z } from 'zod';

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function visit(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(visit);
  return isObject(value) ? expandNullableTypes(value) : value;
}

function expandNullableTypes(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...schema };
  // Visit schema positions only. Defaults, examples and other annotations can
  // contain arbitrary data that must not be interpreted as schemas.
  for (const key of [
    'items',
    'prefixItems',
    'contains',
    'additionalItems',
    'unevaluatedItems',
    'additionalProperties',
    'unevaluatedProperties',
    'propertyNames',
    'anyOf',
    'allOf',
    'oneOf',
    'not',
    'if',
    'then',
    'else',
    'contentSchema',
  ]) {
    if (Object.hasOwn(result, key)) result[key] = visit(result[key]);
  }
  for (const key of [
    'properties',
    'patternProperties',
    '$defs',
    'definitions',
    'dependentSchemas',
    'dependencies',
  ]) {
    const children = result[key];
    if (isObject(children)) {
      result[key] = Object.fromEntries(
        Object.entries(children).map(([name, child]) => [name, visit(child)]),
      );
    }
  }
  const types = result.type;
  if (Array.isArray(types) && types.includes('null')) {
    const anyOf = types.map((type: unknown) => ({ type }));
    delete result.type;
    if (result.anyOf === undefined) result.anyOf = anyOf;
    else {
      // The type assertion and an existing anyOf must both remain true.
      const allOf = Array.isArray(result.allOf) ? result.allOf : [];
      result.allOf = [...allOf, { anyOf }];
    }
  }
  return result;
}

// The SDK uses Standard Schema for validation and JSON Schema conversion.
// Override output serialization only, after Zod's type-union compaction pass.
export function mcpOutputSchema<Output, Input>(
  schema: z.ZodType<Output, Input>,
) {
  const standard = schema['~standard'];
  return {
    '~standard': {
      ...standard,
      jsonSchema: {
        ...standard.jsonSchema,
        output: (options: Parameters<typeof standard.jsonSchema.output>[0]) =>
          expandNullableTypes(standard.jsonSchema.output(options)),
      },
    },
  };
}
