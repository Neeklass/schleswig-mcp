// govdata
import { getPopulationDataset } from '../providers/govdata.ts';
import { populationIndicatorSchema } from './models/population-forecast.ts';
import { pageSchema, paginate } from '../shared/pagination.ts';
import type { ListQuery } from '../shared/pagination.ts';
export const populationPageSchema = pageSchema(populationIndicatorSchema);
export async function listSchleswigPopulationForecast(query: ListQuery = {}) {
  return paginate(
    await getPopulationDataset(),
    query,
    (record) => record.name,
    [
      'Projection with historical inputs; values are not all observed population counts.',
      'metadata.recordCount counts Gold documents; pagination counts indicators. Null values remain missing, not zero.',
    ],
  );
}
