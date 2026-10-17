// bundesnetzagentur
import { getChargingStationDataset } from '../providers/bundesnetzagentur.ts';
import { chargingStationSchema } from './models/car-charging-stations.ts';
import { pageSchema, paginate } from '../shared/pagination.ts';
import type { ListQuery } from '../shared/pagination.ts';
export const chargingStationPageSchema = pageSchema(chargingStationSchema);
export async function listSchleswigChargingStations(query: ListQuery = {}) {
  return paginate(
    await getChargingStationDataset(),
    query,
    (record) =>
      `${record.operator} ${record.displayName ?? ''} ${record.address.street} ${record.address.houseNumber}`,
    [
      'Register status is not live connector availability. The register is not exhaustive.',
      'Opening hours retain the source code; separate weekday and time details are not included.',
    ],
  );
}
