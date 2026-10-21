import { waterLevelHistoryGoldSchema } from '../src/providers/pegelonline.ts';
import type { WaterLevelHistoryGold } from '../src/providers/pegelonline.ts';
import { MEASUREMENTS_URL } from '../src/providers/pegelonline.ts';
import type { WaterLevelDay } from '../src/modules/models/water-level-history.ts';
import { goldLicenseUrls } from '../src/shared/gold-metadata.ts';

// Update pipeline only; request handling never runs this code.

export interface MergeResult {
  days: WaterLevelDay[];
  added: string[];
  conflicts: string[];
}

// Append-only: a day that is already stored is never rewritten. Sources are
// applied in order, so earlier ones win; differing later values are reported.
export function mergeWaterLevelDays(
  ...sources: (readonly WaterLevelDay[])[]
): MergeResult {
  const [stored = [], ...incoming] = sources;
  const days = new Map(stored.map((day) => [day.date, day]));
  const added: string[] = [];
  const conflicts: string[] = [];
  for (const source of incoming)
    for (const day of source) {
      const existing = days.get(day.date);
      if (!existing) {
        days.set(day.date, day);
        added.push(day.date);
      } else if (JSON.stringify(existing) !== JSON.stringify(day))
        conflicts.push(day.date);
    }
  return {
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    added: [...new Set(added)].sort(),
    conflicts: [...new Set(conflicts)].sort(),
  };
}

export function buildWaterLevelHistoryGold(
  days: WaterLevelDay[],
  retrievedAt: string,
): WaterLevelHistoryGold {
  return waterLevelHistoryGoldSchema.parse({
    metadata: {
      id: 'schleswig-water-level-daily',
      title: 'Daily Water Levels at Gauge Schleswig',
      description:
        'Daily minimum, mean and maximum of raw PEGELONLINE water-level measurements at gauge SCHLESWIG (Schlei), aggregated per calendar day in Europe/Berlin. Values are centimetres relative to gauge zero, not water depth.',
      schemaVersion: '1.0.0',
      language: 'de',
      municipality: { name: 'Schleswig', ags: '01059075' },
      dates: {
        dataAsOf: days.at(-1)?.date ?? null,
        sourcePublishedAt: null,
        sourceUpdatedAt: null,
        retrievedAt,
        curatedAt: retrievedAt,
      },
      source: {
        provider: 'PEGELONLINE',
        publisher: 'Wasserstraßen- und Schifffahrtsverwaltung des Bundes (WSV)',
        catalog: null,
        url: 'https://pegelonline.wsv.de/webservice/ueberblick',
        downloadUrl: MEASUREMENTS_URL,
        format: 'JSON',
      },
      license: {
        id: 'DL-DE-Zero-2.0',
        url: goldLicenseUrls['DL-DE-Zero-2.0'],
        attribution:
          'Wasserstraßen- und Schifffahrtsverwaltung des Bundes (WSV), PEGELONLINE',
      },
      temporalCoverage: {
        years: [...new Set(days.map((day) => Number(day.date.slice(0, 4))))],
      },
      processing: {
        steps: [
          'Fetched the raw W measurement series of the last 31 days from the PEGELONLINE REST API.',
          'Grouped measurements by calendar day in Europe/Berlin; skipped the incomplete first day of the window and the current day.',
          'Computed minimum, maximum, arithmetic mean (rounded to 0.1 cm) and the number of measurements per day.',
          'Appended new days only; days already stored are never rewritten.',
        ],
      },
      recordCount: days.length,
    },
    data: days,
  });
}
