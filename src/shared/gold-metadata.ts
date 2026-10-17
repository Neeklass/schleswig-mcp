import { z } from 'zod';

export const goldMetadataSchema = z
  .strictObject({
    id: z.string().regex(/^schleswig-[a-z-]+$/),
    title: z.string().min(1),
    description: z.string().min(1),
    schemaVersion: z.literal('1.0.0'),
    language: z.literal('de'),
    municipality: z.strictObject({
      name: z.literal('Schleswig'),
      ags: z.literal('01059075'),
    }),
    dates: z.strictObject({
      dataAsOf: z.iso.date().nullable(),
      sourcePublishedAt: z.iso.date().nullable(),
      sourceUpdatedAt: z.iso.date().nullable(),
      retrievedAt: z.iso.datetime({ offset: true }).nullable(),
      curatedAt: z.iso.datetime({ offset: true }).nullable(),
    }),
    source: z.strictObject({
      provider: z.string().min(1),
      publisher: z.string().min(1),
      catalog: z.string().min(1).nullable(),
      url: z.url(),
      downloadUrl: z.url().nullable(),
      format: z.string().min(1),
    }),
    license: z.strictObject({
      id: z.enum(['CC-BY-4.0', 'CC0-1.0']),
      url: z.url(),
      attribution: z.string().min(1),
    }),
    coordinateReferenceSystem: z.literal('EPSG:4326').optional(),
    projectedCoordinates: z
      .strictObject({
        fields: z.tuple([z.literal('utmEasting'), z.literal('utmNorthing')]),
        sourceDeclaredCrs: z.literal('EPSG:4647'),
        note: z.string().min(1),
      })
      .optional(),
    temporalCoverage: z
      .strictObject({
        years: z.array(z.number().int().min(1900).max(2200)).min(1),
      })
      .optional(),
    processing: z.strictObject({ steps: z.array(z.string().min(1)).min(1) }),
    recordCount: z.number().int().nonnegative(),
  })
  .superRefine((metadata, context) => {
    const expected =
      metadata.license.id === 'CC-BY-4.0'
        ? 'https://creativecommons.org/licenses/by/4.0/'
        : 'https://creativecommons.org/publicdomain/zero/1.0/';
    if (metadata.license.url !== expected)
      context.addIssue({
        code: 'custom',
        message: 'License identifier and URL do not match.',
        path: ['license', 'url'],
      });
  });

export type GoldMetadata = z.infer<typeof goldMetadataSchema>;

export function goldDatasetSchema<T extends z.ZodType>(
  record: T,
  id: string,
  license: 'CC-BY-4.0' | 'CC0-1.0' = 'CC-BY-4.0',
) {
  return z
    .strictObject({
      metadata: goldMetadataSchema,
      data: z.array(record).min(1),
    })
    .superRefine((value, context) => {
      if (value.metadata.id !== id)
        context.addIssue({
          code: 'custom',
          message: 'Unexpected dataset identifier.',
          path: ['metadata', 'id'],
        });
      if (value.metadata.recordCount !== value.data.length)
        context.addIssue({
          code: 'custom',
          message: 'Record count does not match the data array.',
          path: ['metadata', 'recordCount'],
        });
      if (value.metadata.license.id !== license)
        context.addIssue({
          code: 'custom',
          message: 'Unexpected license for this dataset.',
          path: ['metadata', 'license'],
        });
    });
}

export function uniqueIds<T>(
  records: T[],
  key: (record: T) => string | number,
  context: z.RefinementCtx,
) {
  if (new Set(records.map(key)).size !== records.length)
    context.addIssue({
      code: 'custom',
      message: 'Record identifiers must be unique.',
    });
}
