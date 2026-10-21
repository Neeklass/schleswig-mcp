// Refreshes the Regionaldatenbank Gold files for Schleswig.
// Requires REGIONALSTATISTIK_USERNAME and REGIONALSTATISTIK_PASSWORD.
// Usage: node scripts/update-statistics.ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  fetchRegionalTable,
  parseRegionalTable,
  statisticsDatasetNames,
  statisticsDatasets,
  statisticsGoldFile,
  statisticsGoldSchema,
} from '../src/providers/regionalstatistik.ts';
import type { StatisticsDataset } from '../src/providers/regionalstatistik.ts';
import { buildStatisticsGold, sameData } from './statistics.ts';

const username = process.env['REGIONALSTATISTIK_USERNAME'];
const password = process.env['REGIONALSTATISTIK_PASSWORD'];
if (!username || !password)
  throw new Error(
    'Set REGIONALSTATISTIK_USERNAME and REGIONALSTATISTIK_PASSWORD.',
  );

// The Gold reader resolves from the source tree outside Vercel.
async function readStored(dataset: StatisticsDataset) {
  try {
    const contents = await readFile(statisticsGoldFile(dataset), 'utf8');
    return statisticsGoldSchema(dataset).parse(JSON.parse(contents));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return undefined;
    throw error;
  }
}

const retrievedAt = new Date().toISOString();
const changed: string[] = [];
for (const dataset of statisticsDatasetNames) {
  const series = [];
  // Sequential requests keep the load on the public service low.
  for (const table of statisticsDatasets[dataset].tables)
    series.push(
      ...parseRegionalTable(
        table,
        await fetchRegionalTable(table, { username, password }),
      ),
    );
  const next = buildStatisticsGold(dataset, series, retrievedAt);
  if (sameData(await readStored(dataset), next)) continue;
  const file = statisticsGoldFile(dataset);
  await mkdir(new URL('.', file), { recursive: true });
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`);
  changed.push(`${dataset} (${next.data.length} series)`);
}
console.log(
  changed.length
    ? `Updated statistics: ${changed.join(', ')}.`
    : 'No changes in statistics.',
);
