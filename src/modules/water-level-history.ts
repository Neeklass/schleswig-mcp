// pegelonline
import { getWaterLevelHistoryDataset } from '../providers/pegelonline.ts';
import { waterLevelDaySchema } from './models/water-level-history.ts';
import { pageSchema, paginate } from '../shared/pagination.ts';
import type { ListQuery } from '../shared/pagination.ts';
export const waterLevelHistoryPageSchema = pageSchema(waterLevelDaySchema);
export async function listSchleswigWaterLevelHistory(query: ListQuery = {}) {
  const dataset = await getWaterLevelHistoryDataset();
  return paginate(
    // Gold stays chronological for appending; the newest day is listed first.
    { metadata: dataset.metadata, data: [...dataset.data].reverse() },
    query,
    (record) => record.date,
    [
      'Newest day first. Daily minimum, mean and maximum of unvalidated raw PEGELONLINE measurements, aggregated by this project per calendar day in Europe/Berlin.',
      'Values are centimetres relative to gauge zero, not water depth. A measurementCount below 1440 (one per minute) indicates gaps in the source series.',
      'PEGELONLINE only serves the last 31 days, so the history starts when collection started and cannot be backfilled. q matches date prefixes such as 2026-10.',
    ],
  );
}
