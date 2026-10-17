import { z } from 'zod';
import {
  readCsv,
  readLocalDataset,
  requireRecords,
} from '../shared/dataset-io.ts';
export const ADDRESS_DOWNLOAD_PAGE =
  'https://geodaten.schleswig-holstein.de/gaialight-sh/_apps/dladownload/dl-hk_alkis.html';
const coordinate = z
  .string()
  .regex(/^\d+\.\d{3}$/)
  .transform(Number);
const rowSchema = z.array(z.string()).length(24);
const markerSchema = z.enum(['N', 'B', 'A']);
const stateSchema = z.string().regex(/^\d{2}$/);
const regionSchema = z.string().regex(/^\d$/);
const municipalitySchema = z.string().regex(/^\d{3}$/);
const recordSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9]{16}$/),
  quality: z.enum(['A', 'B']),
  municipalityId: z.literal('01059075'),
  municipality: z.string().min(1),
  streetId: z.string().regex(/^[A-Za-z0-9]{5}$/),
  street: z.string().min(1),
  houseNumber: z.string().regex(/^\d+$/),
  addressExtra: z.string(),
  postalCode: z
    .union([z.literal(''), z.string().regex(/^\d{5}$/)])
    .transform((value) => value || null),
  zone: z.literal('32'),
  easting: coordinate.pipe(z.number().min(100_000).max(999_999.999)),
  northing: coordinate.pipe(z.number().min(0).max(10_000_000)),
});
// Explicit offline read; never invoked by an HTTP request or at module load.
export async function loadSchleswigAddresses(path: string, dataAsOf: string) {
  const snapshotDate = z.iso.date().parse(dataAsOf);
  const records = await readLocalDataset(path, async (bytes) => {
    const selected: AddressRecord[] = [];
    await readCsv(bytes, { delimiter: ';', quote: false }, (raw) => {
      const row = rowSchema.parse(raw);
      markerSchema.parse(row[0]);
      const state = stateSchema.parse(row[3]);
      const region = regionSchema.parse(row[5]);
      const district = stateSchema.parse(row[7]);
      const municipality = municipalitySchema.parse(row[9]);
      const municipalityId = state + region + district + municipality;
      if (municipalityId !== '01059075') return;
      const record = recordSchema.parse({
        id: row[1],
        quality: row[2],
        municipalityId,
        municipality: row[10],
        streetId: row[13],
        street: row[14],
        houseNumber: row[15],
        addressExtra: row[16],
        zone: row[17],
        easting: row[18],
        northing: row[19],
        postalCode: row[20],
      });
      selected.push({ ...record, coordinateReferenceSystem: 'EPSG:25832' });
    });
    return requireRecords(selected);
  });
  return {
    records,
    retrievedAt: new Date().toISOString(),
    source: {
      name: 'LVermGeo SH',
      url: ADDRESS_DOWNLOAD_PAGE,
      dataAsOf: snapshotDate,
      license: 'CC-BY-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      attribution: '©GeoBasis-DE/LVermGeo SH/CC BY 4.0 (Quelle verändert)',
      changes:
        'Filtered by municipality key 01059075; selected and normalized fields; coordinates unchanged.',
    },
    notices: [
      'Projected coordinates in metres, not longitude/latitude; postal codes are not reconciled with Deutsche Post.',
    ],
  };
}
export type AddressRecord = z.output<typeof recordSchema> & {
  coordinateReferenceSystem: 'EPSG:25832';
};
