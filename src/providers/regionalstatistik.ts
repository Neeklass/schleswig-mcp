// Regionaldatenbank Deutschland (Statistische Ämter des Bundes und der Länder),
// GENESIS REST API 2020. Requests need a registered account and run only in
// the update pipeline; public requests read the validated Gold files.
import { inflateRawSync } from 'node:zlib';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { statisticSeriesSchema } from '../modules/models/statistics.ts';
import type { StatisticSeries } from '../modules/models/statistics.ts';
import { DatasetError } from '../shared/dataset-io.ts';
import { goldDatasetSchema, uniqueIds } from '../shared/gold-metadata.ts';
import { cachedGold, curatedRoot } from '../shared/gold-reader.ts';

export const API_BASE = 'https://www.regionalstatistik.de/genesisws/rest/2020';
export const PORTAL_URL = 'https://www.regionalstatistik.de/genesis/online';
export const REGIONAL_VARIABLE = 'GEMEIN';
export const SCHLESWIG_AGS = '01059075';
// Municipality-level tables start in 2008.
export const START_YEAR = 2008;

export const statisticsDatasets = {
  population: {
    title: 'Population of Schleswig',
    description:
      'Official population on 31 December by sex and average age by sex, from the Regionaldatenbank Deutschland.',
    tables: ['12411-01-01-5', '12411-07-01-5'],
  },
  'population-movement': {
    title: 'Births, Deaths and Migration in Schleswig',
    description:
      'Official annual live births and deaths by sex, and moves into and out of Schleswig across municipal borders, from the Regionaldatenbank Deutschland.',
    tables: ['12612-01-01-5', '12613-01-01-5', '12711-91-01-5'],
  },
  construction: {
    title: 'Residential Construction in Schleswig',
    description:
      'Official annual building permits and completions for new residential buildings: buildings, dwellings and living space, from the Regionaldatenbank Deutschland.',
    tables: ['31111-01-02-5', '31121-01-02-5'],
  },
  tourism: {
    title: 'Tourism in Schleswig',
    description:
      'Official annual accommodation statistics: open establishments, beds, guest arrivals and overnight stays, from the Regionaldatenbank Deutschland.',
    tables: ['45412-01-02-5'],
  },
  'municipal-taxes': {
    title: 'Municipal Taxes of Schleswig',
    description:
      'Official annual local business and property tax rates (Hebesätze), tax revenue and municipal shares of income and turnover tax, from the Regionaldatenbank Deutschland.',
    tables: ['71231-01-03-5'],
  },
} as const;
export type StatisticsDataset = keyof typeof statisticsDatasets;
export const statisticsDatasetNames = Object.keys(
  statisticsDatasets,
) as StatisticsDataset[];

export interface RegionalstatistikCredentials {
  username: string;
  password: string;
}
export interface RegionalstatistikOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

// Extracts the only file of a ZIP archive (stored or deflated), as delivered
// by the tablefile service. Sizes come from the central directory because
// local headers may defer them to a data descriptor.
export function readSingleFileZip(archive: Uint8Array): Buffer {
  const bytes = Buffer.from(archive);
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || end + 22 > bytes.length)
    throw new Error('Missing ZIP end record.');
  if (bytes.readUInt16LE(end + 10) !== 1)
    throw new Error('Expected exactly one file in the ZIP archive.');
  const central = bytes.readUInt32LE(end + 16);
  if (bytes.readUInt32LE(central) !== 0x02014b50)
    throw new Error('Invalid ZIP central directory.');
  const method = bytes.readUInt16LE(central + 10);
  const compressedSize = bytes.readUInt32LE(central + 20);
  const size = bytes.readUInt32LE(central + 24);
  const local = bytes.readUInt32LE(central + 42);
  if (bytes.readUInt32LE(local) !== 0x04034b50)
    throw new Error('Invalid ZIP local header.');
  const start =
    local +
    30 +
    bytes.readUInt16LE(local + 26) +
    bytes.readUInt16LE(local + 28);
  const data = bytes.subarray(start, start + compressedSize);
  if (data.length !== compressedSize) throw new Error('Truncated ZIP data.');
  const file =
    method === 0
      ? Buffer.from(data)
      : method === 8
        ? inflateRawSync(data)
        : undefined;
  if (!file) throw new Error(`Unsupported ZIP compression method ${method}.`);
  if (file.length !== size) throw new Error('Unexpected ZIP file size.');
  return file;
}

const statusSchema = z.looseObject({
  Status: z.looseObject({ Code: z.number(), Content: z.string() }),
});

export async function fetchRegionalTable(
  code: string,
  credentials: RegionalstatistikCredentials,
  options: RegionalstatistikOptions = {},
): Promise<string> {
  const signal = AbortSignal.timeout(options.timeoutMs ?? 120_000);
  const body = new URLSearchParams({
    name: code,
    area: 'all',
    format: 'ffcsv',
    compress: 'false',
    regionalvariable: REGIONAL_VARIABLE,
    regionalkey: SCHLESWIG_AGS,
    startyear: String(START_YEAR),
    language: 'de',
  });
  let response: Response;
  let bytes: Uint8Array;
  try {
    // Credentials travel in headers, never in the URL.
    response = await (options.fetch ?? globalThis.fetch)(
      `${API_BASE}/data/tablefile`,
      {
        method: 'POST',
        headers: {
          username: credentials.username,
          password: credentials.password,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal,
      },
    );
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    throw new DatasetError(
      signal.aborted ? 'SOURCE_TIMEOUT' : 'SOURCE_UNAVAILABLE',
      `Table ${code} could not be fetched.`,
      { cause: error },
    );
  }
  if (!response.ok)
    throw new DatasetError(
      'SOURCE_UNAVAILABLE',
      `Table ${code}: HTTP status ${response.status}.`,
    );
  // Errors (wrong login, unknown table, too large) arrive as JSON status.
  if (!response.headers.get('content-type')?.includes('zip')) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
    } catch {
      // Reported below as an unexpected response.
    }
    const status = statusSchema.safeParse(parsed);
    throw new DatasetError(
      'SOURCE_UNAVAILABLE',
      `Table ${code}: ${status.success ? `status ${status.data.Status.Code}: ${status.data.Status.Content}` : 'unexpected response'}`,
    );
  }
  try {
    return readSingleFileZip(bytes).toString('utf8');
  } catch (error) {
    throw new DatasetError(
      'INVALID_SOURCE_DATA',
      `Table ${code}: invalid archive.`,
      { cause: error },
    );
  }
}

// GENESIS signs for cells without a plain number. Officially "-" means
// "nothing", but tables also use it for measures no longer collected (e.g.
// beds in 45412-01-02-5 since 2018), so no sign is converted into a number.
const markers = new Set(['-', '.', '...', 'x', '/']);

function parseValue(raw: string) {
  const text = raw.trim();
  if (/^-?\d+(,\d+)?$/.test(text))
    return { value: Number(text.replace(',', '.')), marker: null };
  if (markers.has(text)) return { value: null, marker: text };
  throw new Error(`Unknown value "${raw}".`);
}

const rowSchema = z.record(z.string(), z.string());

// Maps one "flat file CSV" table to series. Every row must belong to Schleswig.
export function parseRegionalTable(
  code: string,
  csv: string,
): StatisticSeries[] {
  try {
    const rows = z.array(rowSchema).parse(
      parse(csv, {
        columns: true,
        delimiter: ';',
        bom: true,
        skip_empty_lines: true,
      }),
    );
    if (rows.length === 0) throw new Error('The table has no rows.');
    const series = new Map<string, StatisticSeries>();
    for (const row of rows) {
      const field = (name: string) => {
        const value = row[name];
        if (value === undefined) throw new Error(`Missing column ${name}.`);
        return value;
      };
      if (
        field('1_variable_code') !== REGIONAL_VARIABLE ||
        field('1_variable_attribute_code') !== SCHLESWIG_AGS
      )
        throw new Error('Row outside Schleswig.');
      const breakdown: StatisticSeries['breakdown'] = [];
      for (
        let index = 2;
        row[`${index}_variable_code`] !== undefined;
        index++
      ) {
        const variable = field(`${index}_variable_code`);
        if (!variable) continue;
        breakdown.push({
          variable,
          variableLabel: field(`${index}_variable_label`),
          code: field(`${index}_variable_attribute_code`) || null,
          label: field(`${index}_variable_attribute_label`) || 'Insgesamt',
        });
      }
      const measure = field('value_variable_code');
      const id = [
        code,
        measure,
        ...breakdown.map((item) => item.code ?? 'TOTAL'),
      ].join('.');
      const entry: StatisticSeries = series.get(id) ?? {
        id,
        table: { code, statistic: field('statistics_label') },
        measure: { code: measure, label: field('value_variable_label') },
        unit: field('value_unit'),
        breakdown,
        values: [],
      };
      entry.values.push({
        period: field('time'),
        ...parseValue(field('value')),
      });
      series.set(id, entry);
    }
    return [...series.values()]
      .map((entry) => {
        entry.values.sort((a, b) => a.period.localeCompare(b.period));
        if (
          new Set(entry.values.map((item) => item.period)).size !==
          entry.values.length
        )
          throw new Error(`Duplicate periods in ${entry.id}.`);
        return statisticSeriesSchema.parse(entry);
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch (error) {
    if (error instanceof DatasetError) throw error;
    throw new DatasetError(
      'INVALID_SOURCE_DATA',
      `Table ${code} has an unexpected format.`,
      { cause: error },
    );
  }
}

export function statisticsGoldSchema(dataset: StatisticsDataset) {
  const tables: readonly string[] = statisticsDatasets[dataset].tables;
  return goldDatasetSchema(
    statisticSeriesSchema,
    `schleswig-${dataset}`,
    'DL-DE-BY-2.0',
  ).superRefine((value, context) => {
    uniqueIds(value.data, (record) => record.id, context);
    const present = new Set(value.data.map((record) => record.table.code));
    if (
      present.size !== tables.length ||
      tables.some((table) => !present.has(table))
    )
      context.addIssue({
        code: 'custom',
        message: 'The dataset must contain exactly its configured tables.',
        path: ['data'],
      });
  });
}
export type StatisticsGold = z.infer<ReturnType<typeof statisticsGoldSchema>>;

export function statisticsGoldFile(dataset: StatisticsDataset) {
  return new URL(`regionalstatistik/${dataset}.json`, curatedRoot);
}

const readers = Object.fromEntries(
  statisticsDatasetNames.map((dataset) => [
    dataset,
    cachedGold(statisticsGoldFile(dataset), statisticsGoldSchema(dataset)),
  ]),
) as Record<StatisticsDataset, () => Promise<StatisticsGold>>;

export function getStatisticsDataset(dataset: StatisticsDataset) {
  return readers[dataset]();
}
