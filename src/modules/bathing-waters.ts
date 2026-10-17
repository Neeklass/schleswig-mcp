// govdata
import { getBathingWaterDataset } from '../providers/govdata.ts';
import { bathingWaterSchema } from './models/bathing-waters.ts';
import { pageSchema, paginate } from '../shared/pagination.ts';
import type { ListQuery } from '../shared/pagination.ts';
export const bathingWaterPageSchema = pageSchema(bathingWaterSchema);
export async function listSchleswigBathingWaters(query: ListQuery = {}) {
  return paginate(
    await getBathingWaterDataset(),
    query,
    (record) => `${record.name} ${record.keywords.join(' ')}`,
    [
      'Reference data only; no current water quality, opening status or swimming safety assessment.',
      'Use longitude/latitude. The source declaration of the projected coordinate system is inconsistent with its unprefixed eastings.',
    ],
  );
}
