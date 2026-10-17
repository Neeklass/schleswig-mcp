import { z } from 'zod';
import {
  readJson,
  readRemoteDataset,
  requireRecords,
} from '../shared/dataset-io.ts';
import type { DatasetFetchOptions } from '../shared/dataset-io.ts';

export const HERITAGE_URL =
  'https://opendata.schleswig-holstein.de/dataset/f67c373c-3665-4ddf-946b-285b550a72a4/resource/810e96ef-0cf3-445a-a3ce-080d77696930/download/denkmalliste.json';

const recordSchema = z.object({
  Objektnummer: z.number().int().positive(),
  Gemeinde: z.string().min(1),
  Kreis: z.string().min(1),
  Bezeichnung: z.string(),
  Beschreibung: z.string(),
  Kulturdenkmaltyp: z.string().min(1),
  'Adresse-Lage': z.string().optional(),
  Schutzumfang: z.array(z.string()).optional(),
  Begründung: z.array(z.string()).optional(),
});

export async function fetchSchleswigHeritage(
  options: DatasetFetchOptions = {},
) {
  const records = await readRemoteDataset(
    HERITAGE_URL,
    async (bytes) => {
      const data = z.array(recordSchema).parse(await readJson(bytes));
      return requireRecords(
        data
          .filter(
            (entry) =>
              entry.Gemeinde === 'Schleswig, Stadt' &&
              entry.Kreis === 'Kreis Schleswig-Flensburg',
          )
          .map((entry) => ({
            id: String(entry.Objektnummer),
            municipality: entry.Gemeinde,
            district: entry.Kreis,
            name: entry.Bezeichnung,
            description: entry.Beschreibung,
            type: entry.Kulturdenkmaltyp,
            address: entry['Adresse-Lage'] ?? null,
            protectionScope: entry.Schutzumfang ?? null,
            protectionReasons: entry.Begründung ?? null,
          })),
      );
    },
    options,
  );
  return {
    records,
    retrievedAt: new Date().toISOString(),
    source: {
      name: 'Landesamt für Denkmalpflege Schleswig-Holstein',
      url: HERITAGE_URL,
      dataAsOf: '2026-10-12',
      license: 'CC-BY-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      attribution: 'Landesamt für Denkmalpflege Schleswig-Holstein',
      changes:
        'Filtered to Schleswig; field names normalized; photo links omitted.',
    },
  };
}

export type HeritageRecord = Awaited<
  ReturnType<typeof fetchSchleswigHeritage>
>['records'][number];
