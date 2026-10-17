import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { goldMetadataSchema } from '../src/shared/gold-metadata.ts';
import {
  cachedGold,
  curatedRoot,
  readGold,
} from '../src/shared/gold-reader.ts';
import {
  addressGoldSchema,
  getAddressDataset,
} from '../src/providers/geodata.ts';
import { monumentGoldSchema } from '../src/providers/opendata-sh.ts';
import {
  bathingGoldSchema,
  populationGoldSchema,
  getPopulationDataset,
} from '../src/providers/govdata.ts';
import { chargingGoldSchema } from '../src/providers/bundesnetzagentur.ts';
import {
  listSchleswigAddresses,
  addressPageSchema,
} from '../src/modules/addresses.ts';
import {
  listSchleswigMonuments,
  monumentPageSchema,
} from '../src/modules/monuments.ts';
import {
  listSchleswigBathingWaters,
  bathingWaterPageSchema,
} from '../src/modules/bathing-waters.ts';
import {
  listSchleswigChargingStations,
  chargingStationPageSchema,
} from '../src/modules/car-charging-stations.ts';
import {
  listSchleswigPopulationForecast,
  populationPageSchema,
} from '../src/modules/population-forecast.ts';

const fixtures = [
  ['geodata-sh/addresses.json', addressGoldSchema, 7619],
  ['opendata-sh/monuments.json', monumentGoldSchema, 251],
  ['govdata/bathing_waters.json', bathingGoldSchema, 2],
  ['govdata/population_forecast.json', populationGoldSchema, 1],
  ['bundesnetzagentur/charging-stations.json', chargingGoldSchema, 61],
] as const;
async function raw(file: string): Promise<unknown> {
  return JSON.parse(
    await readFile(new URL(file, curatedRoot), 'utf8'),
  ) as unknown;
}

describe.each(fixtures)('Gold file %s', (file, schema, count) => {
  it('validates every record and its complete metadata without live services', async () => {
    const result = schema.parse(await raw(file));
    expect(result.data).toHaveLength(count);
    expect(result.metadata.recordCount).toBe(count);
    expect(result.metadata.municipality.ags).toBe('01059075');
    expect(result.metadata.dates.retrievedAt).toBeNull();
    expect(result.metadata.dates.curatedAt).toBeNull();
  });
  it('rejects inconsistent counts, identifiers, licenses and unknown root fields', async () => {
    const result = schema.parse(await raw(file));
    expect(schema.safeParse({ ...result, recordCount: count }).success).toBe(
      false,
    );
    for (const change of [
      { recordCount: count + 1 },
      { id: 'schleswig-wrong' },
      {
        license: {
          ...result.metadata.license,
          id:
            result.metadata.license.id === 'CC0-1.0' ? 'CC-BY-4.0' : 'CC0-1.0',
        },
      },
    ]) {
      expect(
        schema.safeParse({
          ...result,
          metadata: { ...result.metadata, ...change },
        }).success,
      ).toBe(false);
    }
    const data = [...result.data, result.data[0]];
    expect(
      schema.safeParse({
        ...result,
        data,
        metadata: { ...result.metadata, recordCount: data.length },
      }).success,
    ).toBe(false);
  });
});

describe('Gold validation details', () => {
  it('rejects invalid dates, date-only timestamps, missing fields and wrong AGS', async () => {
    const { metadata } = addressGoldSchema.parse(
      await raw('geodata-sh/addresses.json'),
    );
    for (const change of [
      { dates: { ...metadata.dates, dataAsOf: '2026-02-30' } },
      { dates: { ...metadata.dates, curatedAt: '2026-10-17' } },
      { municipality: { name: 'Schleswig', ags: '01059000' } },
      { processing: [] },
      { description: undefined },
      { source: { provider: 'GovData' } },
    ])
      expect(
        goldMetadataSchema.safeParse({ ...metadata, ...change }).success,
      ).toBe(false);
  });
  it('rejects missing address fields, numeric identifiers and invalid coordinates', async () => {
    const document = addressGoldSchema.parse(
      await raw('geodata-sh/addresses.json'),
    );
    for (const change of [
      { street: undefined },
      { houseNumber: 10 },
      { latitude: 91 },
      { longitude: -181 },
      { postalCode: '' },
    ]) {
      expect(
        addressGoldSchema.safeParse({
          ...document,
          metadata: { ...document.metadata, recordCount: 1 },
          data: [{ ...document.data[0], ...change }],
        }).success,
      ).toBe(false);
    }
  });
  it('rejects wrong municipality membership and inconsistent charging points', async () => {
    const bathing = bathingGoldSchema.parse(
      await raw('govdata/bathing_waters.json'),
    );
    bathing.data[0]!.municipalityCode = '026' as '075';
    expect(bathingGoldSchema.safeParse(bathing).success).toBe(false);
    const charging = chargingGoldSchema.parse(
      await raw('bundesnetzagentur/charging-stations.json'),
    );
    charging.data[0]!.chargingPointCount++;
    expect(chargingGoldSchema.safeParse(charging).success).toBe(false);
  });
  it.each([
    'dimensions',
    'duplicateYears',
    'definition',
    'extrema',
    'coverage',
  ])('rejects invalid population %s', async (issue) => {
    const document = populationGoldSchema.parse(
      await raw('govdata/population_forecast.json'),
    );
    const projection = document.data[0]!;
    if (issue === 'dimensions')
      projection.data.indicators[0]!.regionYearValues[0]!.pop();
    if (issue === 'duplicateYears') projection.years[1] = projection.years[0]!;
    if (issue === 'definition')
      projection.indicatorsAndTopics[0]!.indicators[0]!.unit = 'wrong';
    if (issue === 'extrema') projection.data.indicators[0]!.minValue = -999;
    if (issue === 'coverage')
      document.metadata.temporalCoverage!.years = [2040];
    expect(populationGoldSchema.safeParse(document).success).toBe(false);
  });
  it('preserves the two restored German monument texts', async () => {
    const pastorate = await listSchleswigMonuments({ id: '10545' });
    expect(pastorate.data[0]!.description).toContain('Kirchengemeinde');
    expect((await listSchleswigMonuments({ id: '9381' })).data[0]!.name).toBe(
      'Gemeindehaus',
    );
  });
});

describe('read-only Gold cache and controlled failures', () => {
  const directories: string[] = [];
  afterEach(async () => {
    for (const directory of directories.splice(0)) {
      if (
        dirname(resolve(directory)) !== resolve(tmpdir()) ||
        !basename(directory).startsWith('schleswig-gold-')
      )
        throw new Error('Unsafe test cleanup path.');
      await rm(directory, { recursive: true, force: true });
    }
  });
  async function file() {
    const directory = await mkdtemp(join(tmpdir(), 'schleswig-gold-'));
    directories.push(directory);
    return pathToFileURL(join(directory, 'fixture.json'));
  }
  it('distinguishes missing files, malformed JSON and invalid data and retries failed loads', async () => {
    const url = await file();
    const schema = z.strictObject({ value: z.number() });
    const load = cachedGold(url, schema);
    await expect(load()).rejects.toMatchObject({ code: 'DATA_NOT_FOUND' });
    await writeFile(url, '{');
    await expect(load()).rejects.toMatchObject({ code: 'INVALID_SOURCE_DATA' });
    await writeFile(url, '{"value":"bad"}');
    await expect(readGold(url, schema)).rejects.toMatchObject({
      code: 'INVALID_SOURCE_DATA',
    });
    await writeFile(url, '{"value":1}');
    const [first, second] = await Promise.all([load(), load()]);
    expect(first).toBe(second);
    await writeFile(url, '{"value":2}');
    expect(await load()).toBe(first);
    expect(() => {
      first.value = 9;
    }).toThrow();
  });
  it('freezes cached records and nested metadata and makes no network calls', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected network access.'));
    try {
      const dataset = await getAddressDataset();
      expect(Object.isFrozen(dataset.data[0])).toBe(true);
      expect(Object.isFrozen(dataset.metadata.processing.steps)).toBe(true);
      expect(await getAddressDataset()).toBe(dataset);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
});

const modules = [
  [listSchleswigAddresses, addressPageSchema, 7619],
  [listSchleswigMonuments, monumentPageSchema, 251],
  [listSchleswigBathingWaters, bathingWaterPageSchema, 2],
  [listSchleswigChargingStations, chargingStationPageSchema, 61],
  [listSchleswigPopulationForecast, populationPageSchema, 39],
] as const;
describe.each(modules)('shared module %#', (list, schema, total) => {
  it('returns validated, bounded pages with stable order and exact ID filtering', async () => {
    const first = await list({ limit: 1 });
    expect(schema.safeParse(first).success).toBe(true);
    expect(first.pagination).toEqual({
      offset: 0,
      limit: 1,
      total,
      returned: 1,
      nextOffset: 1,
    });
    expect((await list({ offset: 1, limit: 1 })).data[0]!.id).not.toBe(
      first.data[0]!.id,
    );
    expect((await list({ id: first.data[0]!.id })).data).toEqual(first.data);
    expect((await list({ id: 'missing' })).pagination.total).toBe(0);
    expect((await list({ offset: total })).pagination.nextOffset).toBeNull();
    await expect(list({ limit: 101 })).rejects.toThrow();
    await expect(list({ offset: -1 })).rejects.toThrow();
  });
});
it('searches German street names without changing stored text and preserves population nulls', async () => {
  expect(
    (await listSchleswigAddresses({ q: 'ABELSTEG' })).data.every(
      (record) => record.street === 'Abelsteg',
    ),
  ).toBe(true);
  const result = await getPopulationDataset();
  const original = populationGoldSchema.parse(
    await raw('govdata/population_forecast.json'),
  ).data[0]!;
  for (const indicator of result.data) {
    expect(indicator.values.map((item) => item.value)).toEqual(
      original.data.indicators.find((item) => String(item.id) === indicator.id)!
        .regionYearValues[0],
    );
  }
});
