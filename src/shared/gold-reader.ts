import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { z } from 'zod';
import { DatasetError } from './dataset-io.ts';

// Build copies data/curated next to src/, preserving this module-relative path.
export const curatedRoot =
  process.env['VERCEL'] === '1'
    ? pathToFileURL(resolve('data/curated') + '/')
    : new URL('../../data/curated/', import.meta.url);

export async function readGold<T>(file: URL, schema: z.ZodType<T>): Promise<T> {
  let contents: string;
  try {
    contents = await readFile(file, 'utf8');
  } catch (error) {
    const missing =
      error instanceof Error && 'code' in error && error.code === 'ENOENT';
    throw new DatasetError(
      missing ? 'DATA_NOT_FOUND' : 'SOURCE_UNAVAILABLE',
      'The prepared dataset could not be read.',
      { cause: error },
    );
  }
  try {
    return schema.parse(JSON.parse(contents) as unknown);
  } catch (error) {
    throw new DatasetError(
      'INVALID_SOURCE_DATA',
      'The prepared dataset is invalid.',
      { cause: error },
    );
  }
}

function freeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
}

// A single promise shares concurrent loads. Failed reads can be retried.
export function cachedGold<T>(file: URL, schema: z.ZodType<T>) {
  let cached: Promise<T> | undefined;
  return () => {
    cached ??= readGold(file, schema)
      .then((value) => {
        freeze(value);
        return value;
      })
      .catch((error: unknown) => {
        cached = undefined;
        throw error;
      });
    return cached;
  };
}
