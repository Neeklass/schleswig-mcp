import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { CsvError, parse } from 'csv-parse';
import type { Options } from 'csv-parse';
import { z } from 'zod';

export type DatasetErrorCode =
  | 'SOURCE_UNAVAILABLE'
  | 'SOURCE_TIMEOUT'
  | 'INVALID_SOURCE_DATA'
  | 'DATA_NOT_FOUND';

export class DatasetError extends Error {
  readonly code: DatasetErrorCode;

  constructor(code: DatasetErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DatasetError';
    this.code = code;
  }
}

export interface DatasetFetchOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

type DatasetBytes = AsyncIterable<Uint8Array>;

function sourceError(error: unknown) {
  if (error instanceof DatasetError) return error;
  const invalid =
    error instanceof z.ZodError ||
    error instanceof CsvError ||
    error instanceof SyntaxError;
  return new DatasetError(
    invalid ? 'INVALID_SOURCE_DATA' : 'SOURCE_UNAVAILABLE',
    invalid
      ? 'The dataset has an invalid format.'
      : 'Unable to read the dataset.',
    { cause: error },
  );
}

export async function readRemoteDataset<T>(
  url: string,
  consume: (bytes: DatasetBytes) => Promise<T>,
  options: DatasetFetchOptions = {},
  maxBytes = 16 * 1_024 * 1_024,
): Promise<T> {
  const signal = AbortSignal.timeout(options.timeoutMs ?? 30_000);
  let response: Response | undefined;
  try {
    response = await (options.fetch ?? globalThis.fetch)(url, { signal });
    if (!response.ok || !response.body)
      throw new DatasetError(
        'SOURCE_UNAVAILABLE',
        `Dataset HTTP status: ${response.status}.`,
      );
    const body = response.body;
    async function* boundedBody() {
      let length = 0;
      for await (const chunk of body) {
        length += chunk.byteLength;
        if (length > maxBytes)
          throw new DatasetError(
            'INVALID_SOURCE_DATA',
            'Dataset exceeds the download size limit.',
          );
        yield chunk;
      }
    }
    return await consume(boundedBody());
  } catch (error) {
    if (signal.aborted)
      throw new DatasetError('SOURCE_TIMEOUT', 'Dataset request timed out.', {
        cause: error,
      });
    throw sourceError(error);
  } finally {
    if (response?.body && !response.body.locked)
      await response.body.cancel().catch(() => {});
  }
}

export async function readLocalDataset<T>(
  path: string,
  consume: (bytes: DatasetBytes) => Promise<T>,
): Promise<T> {
  const stream = createReadStream(path);
  try {
    return await consume(stream);
  } catch (error) {
    throw sourceError(error);
  } finally {
    stream.destroy();
  }
}

export async function readJson(bytes: DatasetBytes): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of bytes) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

// All three delimited sources need proper quoting, streaming and error cleanup.
export async function readCsv(
  bytes: DatasetBytes,
  options: Options,
  onRow: (row: unknown) => void,
) {
  await pipeline(
    bytes,
    parse({
      bom: true,
      skip_empty_lines: true,
      max_record_size: 256 * 1_024,
      ...options,
    }),
    async (rows) => {
      for await (const row of rows) onRow(row);
    },
  );
}

export function requireRecords<T>(records: T[]): T[] {
  if (records.length === 0)
    throw new DatasetError(
      'DATA_NOT_FOUND',
      'No records for Schleswig were found.',
    );
  return records;
}
