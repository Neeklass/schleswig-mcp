import {
  API_BASE,
  PORTAL_URL,
  REGIONAL_VARIABLE,
  SCHLESWIG_AGS,
  START_YEAR,
  statisticsDatasets,
  statisticsGoldSchema,
} from '../src/providers/regionalstatistik.ts';
import type {
  StatisticsDataset,
  StatisticsGold,
} from '../src/providers/regionalstatistik.ts';
import type { StatisticSeries } from '../src/modules/models/statistics.ts';
import { goldLicenseUrls } from '../src/shared/gold-metadata.ts';

// Update pipeline only; request handling never runs this code.

// Newest reference date: a stock date as is, an annual sum as 31 December.
function newestDate(series: StatisticSeries[]) {
  const periods = series.flatMap((item) =>
    item.values.map(({ period }) =>
      period.length === 4 ? `${period}-12-31` : period,
    ),
  );
  return periods.sort().at(-1) ?? null;
}

export function buildStatisticsGold(
  dataset: StatisticsDataset,
  series: StatisticSeries[],
  retrievedAt: string,
): StatisticsGold {
  const config = statisticsDatasets[dataset];
  const years = [
    ...new Set(
      series.flatMap((item) =>
        item.values.map(({ period }) => Number(period.slice(0, 4))),
      ),
    ),
  ].sort((a, b) => a - b);
  return statisticsGoldSchema(dataset).parse({
    metadata: {
      id: `schleswig-${dataset}`,
      title: config.title,
      description: config.description,
      schemaVersion: '1.0.0',
      language: 'de',
      municipality: { name: 'Schleswig', ags: SCHLESWIG_AGS },
      dates: {
        dataAsOf: newestDate(series),
        sourcePublishedAt: null,
        sourceUpdatedAt: null,
        retrievedAt,
        curatedAt: retrievedAt,
      },
      source: {
        provider: 'Regionaldatenbank Deutschland',
        publisher: 'Statistische Ämter des Bundes und der Länder',
        catalog: null,
        url: PORTAL_URL,
        downloadUrl: null,
        format: `ffcsv via GENESIS REST API (${API_BASE}/data/tablefile)`,
      },
      license: {
        id: 'DL-DE-BY-2.0',
        url: goldLicenseUrls['DL-DE-BY-2.0'],
        attribution: `© Statistische Ämter des Bundes und der Länder, Deutschland, ${retrievedAt.slice(0, 4)}. Datenlizenz Deutschland – Namensnennung – Version 2.0. Tabellen: ${config.tables.join(', ')}.`,
      },
      temporalCoverage: { years },
      processing: {
        steps: [
          `Downloaded tables ${config.tables.join(', ')} as flat-file CSV, filtered by the source to ${REGIONAL_VARIABLE} ${SCHLESWIG_AGS} from ${START_YEAR}.`,
          'Grouped rows into one series per table, measure and breakdown; sorted values by period.',
          'Converted decimal commas to numbers; kept official signs for missing values in marker and mapped "-" (exactly zero) to 0.',
          'Translated field names into English; German labels, units and codes are unchanged.',
        ],
      },
      recordCount: series.length,
    },
    data: series,
  });
}

// Statistics may be revised, so the data is replaced as a whole; only a
// change in the data itself (not the retrieval time) counts as an update.
export function sameData(
  stored: StatisticsGold | undefined,
  next: StatisticsGold,
) {
  return (
    stored !== undefined &&
    JSON.stringify(stored.data) === JSON.stringify(next.data)
  );
}
