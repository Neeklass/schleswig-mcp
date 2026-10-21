// regionalstatistik
import { getStatisticsDataset } from '../providers/regionalstatistik.ts';
import type { StatisticsDataset } from '../providers/regionalstatistik.ts';
import { statisticSeriesSchema } from './models/statistics.ts';
import { pageSchema, paginate } from '../shared/pagination.ts';
import type { ListQuery } from '../shared/pagination.ts';

export const statisticsPageSchema = pageSchema(statisticSeriesSchema);

const common = [
  'Official statistics from the Regionaldatenbank Deutschland as published; values are not adjusted by this project. Series may contain methodological breaks; see metadata.source.',
  'A null value carries the official sign in marker: "-" nothing (also used where a measure is no longer collected, so it is not converted to 0), "." confidential or unknown, "..." not yet available, "x" not meaningful, "/" not reliable enough.',
  'Each record is one series: id is <table>.<measure>.<breakdown codes>; TOTAL marks the total over a breakdown. q searches statistic, measure and breakdown labels.',
];
const specific: Record<StatisticsDataset, string> = {
  population:
    'Population counts are stocks on 31 December (period YYYY-12-31); average age is in years.',
  'population-movement':
    'Births, deaths and moves are annual sums (period YYYY). Moves count crossings of the municipal border, not net migration.',
  construction:
    'Annual sums of permits and completions for new residential buildings; living space is in 1,000 m².',
  tourism:
    'Annual sums from the monthly accommodation survey; it covers establishments above the survey threshold, not all private rentals. Beds (GAST03) are marked "-" since 2018 because this table no longer reports them.',
  'municipal-taxes':
    'Annual values; tax rates (Hebesätze) are percentages, amounts are euros.',
};

export async function listSchleswigStatistics(
  dataset: StatisticsDataset,
  query: ListQuery = {},
) {
  return paginate(
    await getStatisticsDataset(dataset),
    query,
    (record) =>
      [
        record.table.statistic,
        record.measure.label,
        ...record.breakdown.map((item) => item.label),
      ].join(' '),
    [specific[dataset], ...common],
  );
}
