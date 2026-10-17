import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deploymentOrigin } from '../src/shared/deployment.ts';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('deployment configuration', () => {
  it('uses the explicit canonical origin before the Vercel hostname', () => {
    vi.stubEnv('PUBLIC_ORIGIN', 'https://city.example/');
    vi.stubEnv('VERCEL_URL', 'preview.example');
    expect(deploymentOrigin()).toBe('https://city.example');
    vi.stubEnv('PUBLIC_ORIGIN', undefined);
    expect(deploymentOrigin()).toBe('https://preview.example');
    vi.stubEnv('VERCEL_URL', undefined);
    expect(deploymentOrigin()).toBeUndefined();
  });
  it.each([
    'http://city.example',
    'https://user:secret@city.example',
    'https://city.example/path',
    'https://city.example/?query=x',
    'https://city.example/#fragment',
  ])('rejects invalid public origin %s', (origin) => {
    vi.stubEnv('PUBLIC_ORIGIN', origin);
    expect(deploymentOrigin).toThrow();
  });
  it('resolves Vercel Gold files from the deployment root and loads addresses', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.resetModules();
    const { curatedRoot } = await import('../src/shared/gold-reader.ts');
    expect(resolve(fileURLToPath(curatedRoot))).toBe(resolve('data/curated'));
    const { getAddressDataset } = await import('../src/providers/geodata.ts');
    expect((await getAddressDataset()).data.length).toBe(7619);
  });
  it('packages Gold for both functions and routes other paths to 404', async () => {
    const configuration = JSON.parse(
      await readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
    ) as {
      functions: Record<string, { includeFiles: string }>;
      routes: { src: string; dest?: string; status?: number }[];
    };
    expect(Object.keys(configuration.functions)).toEqual([
      'api/index.ts',
      'api/mcp.ts',
    ]);
    for (const fn of Object.values(configuration.functions))
      expect(fn.includeFiles).toBe('data/curated/**/*.json');
    expect(configuration.routes.at(-1)).toEqual({ src: '/.*', status: 404 });
  });
});
