import { describe, expect, it } from 'vitest';
import { readJson, readRemoteDataset } from '../src/shared/dataset-io.ts';

describe('dataset download boundaries', () => {
  it('limits streamed bytes and cancels an oversized response', async () => {
    let cancelled = false;
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"large":true}'));
        },
        cancel() {
          cancelled = true;
        },
      }),
    );
    await expect(
      readRemoteDataset(
        'https://example.test/data',
        readJson,
        { fetch: async () => response },
        4,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_SOURCE_DATA' });
    expect(cancelled).toBe(true);
  });

  it('cancels unsuccessful HTTP response bodies', async () => {
    let cancelled = false;
    const response = new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
      { status: 429 },
    );
    await expect(
      readRemoteDataset('https://example.test/data', readJson, {
        fetch: async () => response,
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' });
    expect(cancelled).toBe(true);
  });

  it('distinguishes broken body transport from malformed JSON', async () => {
    await expect(
      readRemoteDataset('https://example.test/data', readJson, {
        fetch: async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.error(new TypeError('Connection interrupted'));
              },
            }),
          ),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' });
    await expect(
      readRemoteDataset('https://example.test/data', readJson, {
        fetch: async () => new Response('{'),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SOURCE_DATA' });
  });
});
