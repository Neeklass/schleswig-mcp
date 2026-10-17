// opendata-sh
import { getMonumentDataset } from '../providers/opendata-sh.ts';
import { monumentSchema } from './models/monuments.ts';
import { pageSchema, paginate } from '../shared/pagination.ts';
import type { ListQuery } from '../shared/pagination.ts';
export const monumentPageSchema = pageSchema(monumentSchema);
export async function listSchleswigMonuments(query: ListQuery = {}) {
  return paginate(
    await getMonumentDataset(),
    query,
    (record) => `${record.name} ${record.addressLocation ?? ''}`,
    [
      'Snapshot of a non-exhaustive register. Photo URLs are source references; image contents are not fetched.',
    ],
  );
}
