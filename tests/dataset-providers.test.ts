import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  fetchSchleswigHeritage,
  HERITAGE_URL,
} from '../src/providers/opendata-sh.ts';
import {
  BATHING_WATERS_URL,
  fetchSchleswigPopulationProjection,
  fetchSchleswigBathingWaters,
  POPULATION_URL,
} from '../src/providers/govdata.ts';
import { fetchSchleswigChargingStations } from '../src/providers/bundesnetzagentur.ts';
import { loadSchleswigAddresses } from '../src/providers/geodata.ts';
import type { DatasetFetchOptions } from '../src/shared/dataset-io.ts';
import {
  addressRow,
  bathingWaterRow,
  chargingFixture,
  chargingRow,
  csvRow,
  heritageFixture,
  populationFixture,
} from './dataset-fixtures.ts';

function jsonFetch(value: unknown): DatasetFetchOptions {
  return { fetch: async () => Response.json(value) };
}

function textFetch(
  value: string,
  encoding: BufferEncoding = 'utf8',
): DatasetFetchOptions {
  return { fetch: async () => new Response(Buffer.from(value, encoding)) };
}

describe('heritage provider', () => {
  it('selects Schleswig, maps fields, retains attribution and omits source photo links', async () => {
    const body = heritageFixture();
    body.push({ ...body[0]!, Objektnummer: 124, Gemeinde: 'Flensburg, Stadt' });
    const fetchData = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(body));
    const result = await fetchSchleswigHeritage({ fetch: fetchData });
    expect(fetchData).toHaveBeenCalledWith(
      HERITAGE_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.records).toEqual([
      {
        id: '123',
        municipality: 'Schleswig, Stadt',
        district: 'Kreis Schleswig-Flensburg',
        name: 'Example monument',
        description: 'Synthetic description.',
        type: 'Baudenkmal',
        address: 'Example street 1',
        protectionScope: ['Building'],
        protectionReasons: ['Historical'],
      },
    ]);
    expect(result.source).toMatchObject({
      license: 'CC-BY-4.0',
      dataAsOf: '2026-10-12',
      attribution: 'Landesamt für Denkmalpflege Schleswig-Holstein',
    });
  });

  it('keeps absent source details distinct from empty arrays', async () => {
    const result = await fetchSchleswigHeritage(
      jsonFetch([
        {
          ...heritageFixture()[0],
          'Adresse-Lage': undefined,
          Schutzumfang: undefined,
          Begründung: [],
        },
      ]),
    );
    expect(result.records[0]).toMatchObject({
      address: null,
      protectionScope: null,
      protectionReasons: [],
    });
  });

  it('rejects invalid source data instead of returning a partial result', async () => {
    await expect(
      fetchSchleswigHeritage(
        jsonFetch([{ ...heritageFixture()[0], Objektnummer: '123' }]),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_SOURCE_DATA' });
    await expect(fetchSchleswigHeritage(jsonFetch([]))).rejects.toMatchObject({
      code: 'DATA_NOT_FOUND',
    });
  });
});

describe('GovData provider: Wegweiser Kommune population projection', () => {
  it('joins region, indicator and year axes without converting null to zero', async () => {
    const fetchData = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(populationFixture()));
    const result = await fetchSchleswigPopulationProjection({
      fetch: fetchData,
    });
    expect(fetchData).toHaveBeenCalledWith(
      POPULATION_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.municipality).toEqual({ id: '01059075', name: 'Schleswig' });
    expect(result.indicators).toEqual([
      {
        id: '336',
        name: 'Population',
        unit: 'people',
        values: [
          { year: 2040, value: null },
          { year: 2018, value: 25000 },
        ],
      },
    ]);
    expect(result.source.license).toBe('CC0-1.0');
    expectTypeOf(result.indicators[0]!.values[0]!.value).toEqualTypeOf<
      number | null
    >();
    expect(result.source.attribution).toContain('Synthetic source credit');
  });

  it.each([
    'years',
    'regions',
    'indicators',
    'regionCount',
    'yearCount',
    'value',
  ] as const)('rejects ambiguous or invalid %s', async (field) => {
    const body = populationFixture();
    if (field === 'years') body.years = [2040, 2040];
    if (field === 'regions') body.data.regions[0]!.ags = '01059075';
    if (field === 'indicators')
      body.data.indicators.push(body.data.indicators[0]!);
    if (field === 'regionCount')
      body.data.indicators[0]!.regionYearValues.pop();
    if (field === 'yearCount')
      body.data.indicators[0]!.regionYearValues[0]!.pop();
    // A string must be rejected, unlike a legitimate missing (null) value.
    const raw: unknown =
      field === 'value'
        ? {
            ...body,
            data: {
              ...body.data,
              indicators: [
                {
                  ...body.data.indicators[0],
                  regionYearValues: [
                    ['bad', 1],
                    [2, 3],
                  ],
                },
              ],
            },
          }
        : body;
    await expect(
      fetchSchleswigPopulationProjection(jsonFetch(raw)),
    ).rejects.toMatchObject({ code: 'INVALID_SOURCE_DATA' });
  });

  it('reports a missing municipality', async () => {
    const body = populationFixture();
    body.data.regions[1]!.ags = '01002000';
    await expect(
      fetchSchleswigPopulationProjection(jsonFetch(body)),
    ).rejects.toMatchObject({ code: 'DATA_NOT_FOUND' });
  });
});

describe('GovData provider: bathing-water reference data', () => {
  it('decodes Latin-1 and selects the municipality key, not the district name', async () => {
    const city = bathingWaterRow();
    city[3] = 'Badestelle "Example"'; // Actual source also uses unquoted literal quotes.
    city[26] = 'Description with | delimiter\nand another line';
    const other = bathingWaterRow();
    other[20] = '026';
    other[21] = 'Fahrdorf';
    const row = csvRow(city, '|').replace(
      '"Badestelle ""Example"""',
      'Badestelle "Example"',
    );
    const fetchData = vi
      .fn<typeof fetch>()
      .mockImplementation(
        textFetch(row + '\n' + csvRow(other, '|'), 'latin1').fetch!,
      );
    const result = await fetchSchleswigBathingWaters({ fetch: fetchData });
    expect(fetchData).toHaveBeenCalledWith(
      BATHING_WATERS_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      name: 'Badestelle "Example"',
      waterType: 'Küstengewässer',
      municipalityId: '01059075',
      latitude: 54.51,
      longitude: 9.55,
      description: city[26],
    });
    expect(result.source.attribution).toBe('Sozialministerium S-H');
  });

  it.each(['columns', 'latitude', 'missingLongitude'] as const)(
    'rejects invalid %s',
    async (field) => {
      const row = bathingWaterRow();
      if (field === 'columns') row.pop();
      if (field === 'latitude') row[25] = '100';
      if (field === 'missingLongitude') row[24] = '';
      await expect(
        fetchSchleswigBathingWaters(textFetch(csvRow(row, '|'))),
      ).rejects.toMatchObject({ code: 'INVALID_SOURCE_DATA' });
    },
  );
});

describe('Bundesnetzagentur provider', () => {
  it('streams quoted multiline CSV, discovers its header and maps decimal commas', async () => {
    const city = chargingRow();
    city[1] = 'Operator; with "quotes"\nand newline';
    const other = chargingRow();
    other[11] = 'Other state';
    const bytes = Buffer.from(chargingFixture([city, other]));
    let offset = 0;
    const result = await fetchSchleswigChargingStations({
      fetch: async () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              if (offset >= bytes.length) controller.close();
              else {
                controller.enqueue(bytes.subarray(offset, offset + 7));
                offset += 7;
              }
            },
          }),
        ),
    });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      operator: city[1],
      ratedPowerKw: 22.5,
      chargingPoints: 2,
      latitude: 54.51,
    });
    expect(result.source).toMatchObject({
      dataAsOf: '2026-09-01',
      attribution: 'Bundesnetzagentur.de',
    });
  });

  it.each(['date', 'header', 'columns', 'power', 'points', 'quotes'] as const)(
    'rejects invalid %s',
    async (field) => {
      const row = chargingRow();
      if (field === 'columns') row.pop();
      if (field === 'power') row[5] = '';
      if (field === 'points') row[4] = '-1';
      let csv = chargingFixture([row]);
      if (field === 'date') csv = csv.replace('01.09.2026', '31.02.2026');
      if (field === 'header')
        csv = csv.replace('Ladeeinrichtungs-ID', 'Unknown');
      if (field === 'quotes') csv += '\n"unfinished';
      await expect(
        fetchSchleswigChargingStations(textFetch(csv)),
      ).rejects.toMatchObject({ code: 'INVALID_SOURCE_DATA' });
    },
  );
});

describe('Geodata provider: local LVermGeo addresses', () => {
  const directories: string[] = [];
  afterEach(async () => {
    for (const directory of directories.splice(0)) {
      const path = resolve(directory);
      if (
        dirname(path) !== resolve(tmpdir()) ||
        !basename(path).startsWith('schleswig-provider-test-')
      )
        throw new Error(
          'Refusing to remove a directory outside the test temporary directory.',
        );
      await rm(path, { recursive: true, force: true });
    }
  });
  async function file(rows: string[][]) {
    const directory = await mkdtemp(join(tmpdir(), 'schleswig-provider-test-'));
    directories.push(directory);
    const path = join(directory, 'addresses.txt');
    await writeFile(path, rows.map((row) => row.join(';')).join('\n'), 'utf8');
    return path;
  }

  it('loads an explicitly supplied file and preserves projected coordinates and address suffixes', async () => {
    const other = addressRow();
    other[9] = '026';
    const result = await loadSchleswigAddresses(
      await file([other, addressRow()]),
      '2026-06-01',
    );
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      municipalityId: '01059075',
      addressExtra: '(134)',
      easting: 534234.662,
      northing: 6038770.162,
      coordinateReferenceSystem: 'EPSG:25832',
    });
    expect(result.source.attribution).toContain('(Quelle verändert)');
  });

  it.each(['columns', 'zone', 'easting', 'quality'] as const)(
    'rejects invalid %s',
    async (field) => {
      const row = addressRow();
      if (field === 'columns') row.pop();
      if (field === 'zone') row[17] = '33';
      if (field === 'easting') row[18] = '32534234.662';
      if (field === 'quality') row[2] = '?';
      await expect(
        loadSchleswigAddresses(await file([row]), '2026-06-01'),
      ).rejects.toMatchObject({ code: 'INVALID_SOURCE_DATA' });
    },
  );

  it('reports a missing file and never falls back to a repository snapshot', async () => {
    const path = await file([]);
    await expect(
      loadSchleswigAddresses(path + '.missing', '2026-06-01'),
    ).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' });
    await expect(
      loadSchleswigAddresses(path, '2026-06-01'),
    ).rejects.toMatchObject({ code: 'DATA_NOT_FOUND' });
  });
});

const remoteProviders: [
  string,
  (options: DatasetFetchOptions) => Promise<unknown>,
][] = [
  ['heritage', fetchSchleswigHeritage],
  ['population', fetchSchleswigPopulationProjection],
  ['bathing waters', fetchSchleswigBathingWaters],
  ['charging stations', fetchSchleswigChargingStations],
];

describe.each(remoteProviders)(
  '%s transport failures',
  (_name, fetchDataset) => {
    it('distinguishes HTTP and network failures from invalid content', async () => {
      await expect(
        fetchDataset({
          fetch: async () => new Response('Unavailable', { status: 503 }),
        }),
      ).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' });
      await expect(
        fetchDataset({
          fetch: async () => {
            throw new TypeError('Connection refused');
          },
        }),
      ).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' });
      await expect(
        fetchDataset(textFetch('<html>Not a dataset</html>')),
      ).rejects.toMatchObject({ code: 'INVALID_SOURCE_DATA' });
    });

    it('aborts a response that stalls while reading its body', async () => {
      const fetchData: typeof fetch = async (_url, init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener(
                'abort',
                () => controller.error(init.signal?.reason),
                { once: true },
              );
            },
          }),
        );
      await expect(
        fetchDataset({ fetch: fetchData, timeoutMs: 10 }),
      ).rejects.toMatchObject({ code: 'SOURCE_TIMEOUT' });
    });
  },
);
