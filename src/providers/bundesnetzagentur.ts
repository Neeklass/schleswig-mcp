import { z } from 'zod';
import {
  DatasetError,
  readCsv,
  readRemoteDataset,
  requireRecords,
} from '../shared/dataset-io.ts';
import type { DatasetFetchOptions } from '../shared/dataset-io.ts';

export const CHARGING_STATIONS_URL =
  'https://data.bundesnetzagentur.de/Bundesnetzagentur/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/Ladesaeulenregister_BNetzA_2026-09-01.csv';

const decimal = z
  .string()
  .regex(/^\d+(,\d+)?$/)
  .transform((value) => Number(value.replace(',', '.')));
const rowSchema = z.array(z.string());
const sourceRecordSchema = z.object({
  'Ladeeinrichtungs-ID': z.string().regex(/^\d+$/),
  Betreiber: z.string().min(1),
  Status: z.string().min(1),
  'Art der Ladeeinrichtung': z.string().min(1),
  'Anzahl Ladepunkte': z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().positive()),
  'Nennleistung Ladeeinrichtung [kW]': decimal.pipe(z.number().positive()),
  Straße: z.string().min(1),
  Hausnummer: z.string(),
  Adresszusatz: z.string(),
  Postleitzahl: z.string().regex(/^\d{5}$/),
  Ort: z.string().min(1),
  Bundesland: z.string().min(1),
  Breitengrad: decimal.pipe(z.number().min(-90).max(90)),
  Längengrad: decimal.pipe(z.number().min(-180).max(180)),
});
const recordSchema = sourceRecordSchema.transform((row) => ({
  id: row['Ladeeinrichtungs-ID'],
  operator: row.Betreiber,
  status: row.Status,
  type: row['Art der Ladeeinrichtung'],
  chargingPoints: row['Anzahl Ladepunkte'],
  ratedPowerKw: row['Nennleistung Ladeeinrichtung [kW]'],
  street: row.Straße,
  houseNumber: row.Hausnummer,
  addressExtra: row.Adresszusatz,
  postalCode: row.Postleitzahl,
  municipality: row.Ort,
  latitude: row.Breitengrad,
  longitude: row.Längengrad,
}));

export async function fetchSchleswigChargingStations(
  options: DatasetFetchOptions = {},
) {
  const result = await readRemoteDataset(
    CHARGING_STATIONS_URL,
    async (bytes) => {
      let headers: string[] | undefined;
      let dataAsOf: string | undefined;
      let preambleRows = 0;
      const selected: z.output<typeof recordSchema>[] = [];
      await readCsv(
        bytes,
        { delimiter: ';', relax_column_count: true },
        (raw) => {
          const row = rowSchema.parse(raw);
          if (!headers) {
            const date =
              /^Letzte Aktualisierung vom: (\d{2})\.(\d{2})\.(\d{4})$/.exec(
                row[0] ?? '',
              );
            if (date)
              dataAsOf = z.iso.date().parse(`${date[3]}-${date[2]}-${date[1]}`);
            if (row[0] === 'Ladeeinrichtungs-ID') {
              headers = row;
              if (
                new Set(headers).size !== headers.length ||
                !Object.keys(sourceRecordSchema.shape).every((field) =>
                  headers!.includes(field),
                )
              )
                throw new DatasetError(
                  'INVALID_SOURCE_DATA',
                  'Missing or duplicate register columns.',
                );
            } else if (++preambleRows > 32) {
              throw new DatasetError(
                'INVALID_SOURCE_DATA',
                'Register header was not found.',
              );
            }
            return;
          }
          if (row.length !== headers.length)
            throw new DatasetError(
              'INVALID_SOURCE_DATA',
              'Register row has an unexpected number of columns.',
            );
          const fields = Object.fromEntries(
            headers.map((header, index) => [header, row[index]]),
          );
          if (
            fields['Ort'] === 'Schleswig' &&
            fields['Postleitzahl'] === '24837' &&
            fields['Bundesland'] === 'Schleswig-Holstein'
          )
            selected.push(recordSchema.parse(fields));
        },
      );
      if (!headers || !dataAsOf)
        throw new DatasetError(
          'INVALID_SOURCE_DATA',
          'Register header or update date is missing.',
        );
      return { records: requireRecords(selected), dataAsOf };
    },
    { ...options, timeoutMs: options.timeoutMs ?? 60_000 },
    128 * 1_024 * 1_024,
  );
  return {
    records: result.records,
    retrievedAt: new Date().toISOString(),
    source: {
      name: 'Bundesnetzagentur',
      url: CHARGING_STATIONS_URL,
      dataAsOf: result.dataAsOf,
      license: 'CC-BY-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      attribution: 'Bundesnetzagentur.de',
      changes:
        'Filtered to Schleswig, postal code 24837, Schleswig-Holstein; selected and normalized fields.',
    },
    notices: [
      'Register status is not live connector availability; the register is not exhaustive.',
    ],
  };
}

export type ChargingStationRecord = z.output<typeof recordSchema>;
