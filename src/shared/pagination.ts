import { z } from 'zod';
import { goldMetadataSchema } from './gold-metadata.ts';
import type { GoldMetadata } from './gold-metadata.ts';

export const listQuerySchema = z.strictObject({
  id: z.string().trim().min(1).max(100).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
});
export type ListQuery = z.input<typeof listQuerySchema>;
export const paginationSchema = z.strictObject({
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  returned: z.number().int().nonnegative(),
  nextOffset: z.number().int().nonnegative().nullable(),
});
export function pageSchema<T extends z.ZodType>(record: T) {
  return z.strictObject({
    metadata: goldMetadataSchema,
    data: z.array(record),
    pagination: paginationSchema,
    notices: z.array(z.string()),
  });
}

export function paginate<T extends { id: string }>(
  dataset: { metadata: GoldMetadata; data: T[] },
  query: ListQuery,
  searchableText: (record: T) => string,
  notices: string[],
) {
  const input = listQuerySchema.parse(query);
  const text = input.q?.toLocaleLowerCase('de-DE');
  const selected = dataset.data.filter(
    (record) =>
      (input.id === undefined || record.id === input.id) &&
      (text === undefined ||
        searchableText(record).toLocaleLowerCase('de-DE').includes(text)),
  );
  const data = selected.slice(input.offset, input.offset + input.limit);
  return {
    metadata: dataset.metadata,
    data,
    pagination: {
      offset: input.offset,
      limit: input.limit,
      total: selected.length,
      returned: data.length,
      nextOffset:
        input.offset + data.length < selected.length
          ? input.offset + data.length
          : null,
    },
    notices,
  };
}
