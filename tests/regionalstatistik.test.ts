import { readFile } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  API_BASE,
  fetchRegionalTable,
  parseRegionalTable,
  readSingleFileZip,
  statisticsDatasetNames,
  statisticsDatasets,
  statisticsGoldFile,
  statisticsGoldSchema,
} from '../src/providers/regionalstatistik.ts';
import type { StatisticSeries } from '../src/modules/models/statistics.ts';
import { listSchleswigStatistics } from '../src/modules/statistics.ts';
import { buildStatisticsGold, sameData } from '../scripts/statistics.ts';

// Minimal single-file ZIP writer for fixtures (local header, data, central
// directory, end record). CRC is not checked by the reader.
function zip(contents: string, deflate = true) {
  const name = Buffer.from('table.csv');
  const raw = Buffer.from(contents, 'utf8');
  const data = deflate ? deflateRawSync(raw) : raw;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(deflate ? 8 : 0, 8);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(deflate ? 8 : 0, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + data.length, 16);
  return Buffer.concat([local, name, data, central, name, end]);
}

const header =
  'statistics_code;statistics_label;time_code;time_label;time;1_variable_code;1_variable_label;1_variable_attribute_code;1_variable_attribute_label;2_variable_code;2_variable_label;2_variable_attribute_code;2_variable_attribute_label;value;value_unit;value_variable_code;value_variable_label';
function row(
  time: string,
  sex: [string, string],
  value: string,
  region = '01059075',
) {
  return `12411;Fortschreibung des Bevölkerungsstandes;STAG;Stichtag;${time};GEMEIN;Gemeinden;${region};Schleswig, Stadt;GES;Geschlecht;${sex[0]};${sex[1]};${value};Anzahl;BEVSTD;Bevölkerungsstand`;
}
// Synthetic values in the verified ffcsv layout.
const csv = [
  `﻿${header}`,
  row('2025-12-31', ['', 'Insgesamt'], '25567'),
  row('2024-12-31', ['', 'Insgesamt'], '25352'),
  row('2024-12-31', ['GESW', 'weiblich'], '-'),
  row('2025-12-31', ['GESW', 'weiblich'], '.'),
  row('2025-12-31', ['GESM', 'männlich'], '12499,5'),
].join('\n');

describe('Regionaldatenbank ZIP reader', () => {
  it.each([true, false])('extracts the single file (deflate=%s)', (deflate) => {
    expect(readSingleFileZip(zip(csv, deflate)).toString('utf8')).toBe(csv);
  });
  it('rejects data that is not a ZIP archive', () => {
    expect(() => readSingleFileZip(Buffer.from('{"Status":{}}'))).toThrow();
  });
});

describe('Regionaldatenbank table parsing', () => {
  it('groups rows into series per measure and breakdown', () => {
    const series = parseRegionalTable('12411-01-01-5', csv);
    expect(series.map((item) => item.id)).toEqual([
      '12411-01-01-5.BEVSTD.GESM',
      '12411-01-01-5.BEVSTD.GESW',
      '12411-01-01-5.BEVSTD.TOTAL',
    ]);
    const [male, female, total] = series as [
      StatisticSeries,
      StatisticSeries,
      StatisticSeries,
    ];
    expect(total).toMatchObject({
      table: {
        code: '12411-01-01-5',
        statistic: 'Fortschreibung des Bevölkerungsstandes',
      },
      measure: { code: 'BEVSTD', label: 'Bevölkerungsstand' },
      unit: 'Anzahl',
      breakdown: [
        {
          variable: 'GES',
          variableLabel: 'Geschlecht',
          code: null,
          label: 'Insgesamt',
        },
      ],
      values: [
        { period: '2024-12-31', value: 25352, marker: null },
        { period: '2025-12-31', value: 25567, marker: null },
      ],
    });
    expect(female.values).toEqual([
      { period: '2024-12-31', value: 0, marker: '-' },
      { period: '2025-12-31', value: null, marker: '.' },
    ]);
    expect(male.values).toEqual([
      { period: '2025-12-31', value: 12499.5, marker: null },
    ]);
  });

  it.each([
    [
      'another municipality',
      row('2023-12-31', ['', 'Insgesamt'], '1', '01001000'),
    ],
    ['an unknown value', row('2023-12-31', ['', 'Insgesamt'], 'n/a')],
    ['a duplicate period', row('2025-12-31', ['', 'Insgesamt'], '1')],
  ])('rejects %s', (_, extra) => {
    expect(() =>
      parseRegionalTable('12411-01-01-5', `${csv}\n${extra}`),
    ).toThrow(expect.objectContaining({ code: 'INVALID_SOURCE_DATA' }));
  });

  it('rejects an empty table', () => {
    expect(() => parseRegionalTable('12411-01-01-5', header)).toThrow(
      expect.objectContaining({ code: 'INVALID_SOURCE_DATA' }),
    );
  });
});

describe('Regionaldatenbank requests', () => {
  it('posts credentials as headers and filters to Schleswig', async () => {
    const requests: Request[] = [];
    const text = await fetchRegionalTable(
      '12411-01-01-5',
      { username: 'user', password: 'secret' },
      {
        fetch: async (input, init) => {
          requests.push(new Request(input, init));
          return new Response(zip(csv), {
            headers: { 'Content-Type': 'application/zip' },
          });
        },
      },
    );
    expect(text).toBe(csv);
    const [request] = requests as [Request];
    expect(request.method).toBe('POST');
    expect(request.url).toBe(`${API_BASE}/data/tablefile`);
    expect(request.url).not.toContain('secret');
    expect(request.headers.get('username')).toBe('user');
    expect(request.headers.get('password')).toBe('secret');
    const body = new URLSearchParams(await request.text());
    expect(Object.fromEntries(body)).toMatchObject({
      name: '12411-01-01-5',
      format: 'ffcsv',
      regionalvariable: 'GEMEIN',
      regionalkey: '01059075',
    });
    expect(body.has('password')).toBe(false);
  });

  it('reports the API status of a JSON error response', async () => {
    await expect(
      fetchRegionalTable(
        '12411-01-01-5',
        { username: 'user', password: 'wrong' },
        {
          fetch: async () =>
            Response.json({
              Status: { Code: 98, Content: 'Die Tabelle ist zu gross.' },
            }),
        },
      ),
    ).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
      message: expect.stringContaining('status 98'),
    });
  });
});

describe('statistics Gold', () => {
  const series = parseRegionalTable('12411-01-01-5', csv);

  it('requires exactly the configured tables', () => {
    expect(() =>
      buildStatisticsGold('population', series, '2026-10-21T05:00:00.000Z'),
    ).toThrow();
    const gold = buildStatisticsGold(
      'tourism',
      series.map((item) => ({
        ...item,
        table: { ...item.table, code: '45412-01-02-5' },
      })),
      '2026-10-21T05:00:00.000Z',
    );
    expect(gold.metadata).toMatchObject({
      id: 'schleswig-tourism',
      recordCount: 3,
      license: { id: 'DL-DE-BY-2.0' },
      dates: { dataAsOf: '2025-12-31' },
      temporalCoverage: { years: [2024, 2025] },
    });
    expect(
      sameData(
        gold,
        buildStatisticsGold('tourism', gold.data, '2026-10-22T05:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it.each(statisticsDatasetNames)(
    'validates the collected Gold file %s',
    async (dataset) => {
      const gold = statisticsGoldSchema(dataset).parse(
        JSON.parse(await readFile(statisticsGoldFile(dataset), 'utf8')),
      );
      expect(gold.metadata.municipality.ags).toBe('01059075');
      expect(new Set(gold.data.map((item) => item.table.code))).toEqual(
        new Set(statisticsDatasets[dataset].tables),
      );
      const page = await listSchleswigStatistics(dataset, { limit: 1 });
      expect(page.pagination.total).toBe(gold.data.length);
    },
  );
});
