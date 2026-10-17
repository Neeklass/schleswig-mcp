// geodata-sh (LVermGeo SH), implemented by the geodata provider.
import { getAddressDataset } from '../providers/geodata.ts';
import { addressSchema } from './models/addresses.ts';
import { pageSchema, paginate } from '../shared/pagination.ts';
import type { ListQuery } from '../shared/pagination.ts';
export const addressPageSchema = pageSchema(addressSchema);
export async function listSchleswigAddresses(query: ListQuery = {}) {
  return paginate(
    await getAddressDataset(),
    query,
    (record) =>
      `${record.street} ${record.houseNumber}${record.addressExtra ?? ''} ${record.postalCode ?? ''}`,
    [
      'Coordinates use EPSG:4326. Postal codes were not reconciled with Deutsche Post.',
    ],
  );
}
