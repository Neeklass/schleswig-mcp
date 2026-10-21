// Appends complete days from PEGELONLINE to the daily water-level Gold file.
// Usage: node scripts/update-water-level-history.ts [--merge <pending.json>]
// --merge adds days from an unmerged update branch so none are lost.
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  aggregateDailyWaterLevels,
  fetchSchleswigMeasurementSeries,
  waterLevelHistoryGoldSchema,
} from '../src/providers/pegelonline.ts';
import {
  buildWaterLevelHistoryGold,
  mergeWaterLevelDays,
} from './water-level-history.ts';

const target = new URL(
  '../data/curated/pegelonline/water-level-daily.json',
  import.meta.url,
);
const { values } = parseArgs({ options: { merge: { type: 'string' } } });

async function readDays(file: URL | string) {
  try {
    const contents = await readFile(file, 'utf8');
    return waterLevelHistoryGoldSchema.parse(JSON.parse(contents)).data;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return [];
    throw error;
  }
}

const now = new Date();
const fetched = aggregateDailyWaterLevels(
  await fetchSchleswigMeasurementSeries({ timeoutMs: 30_000 }),
  now,
);
const result = mergeWaterLevelDays(
  await readDays(target),
  values.merge ? await readDays(values.merge) : [],
  fetched,
);
for (const date of result.conflicts)
  console.warn(`Kept stored values for ${date}; the source now differs.`);
if (result.added.length === 0) {
  console.log('No new complete days.');
} else {
  const gold = buildWaterLevelHistoryGold(result.days, now.toISOString());
  await writeFile(target, `${JSON.stringify(gold, null, 2)}\n`);
  console.log(
    `Added ${result.added.length} day(s): ${result.added.join(', ')}.`,
  );
}
