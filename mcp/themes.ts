import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { mcpOutputSchema } from './output-schema.ts';
import { toolResult } from './tool-result.ts';
import { waterLevelSchema } from '../src/modules/water-level.ts';
import type { GetWaterLevel } from '../src/modules/water-level.ts';
import {
  waterLevelHistoryPageSchema,
  listSchleswigWaterLevelHistory,
} from '../src/modules/water-level-history.ts';
import {
  statisticsPageSchema,
  listSchleswigStatistics,
} from '../src/modules/statistics.ts';
import { listQuerySchema } from '../src/shared/pagination.ts';
import type { ListQuery } from '../src/shared/pagination.ts';
import {
  addressPageSchema,
  listSchleswigAddresses,
} from '../src/modules/addresses.ts';
import {
  monumentPageSchema,
  listSchleswigMonuments,
} from '../src/modules/monuments.ts';
import {
  bathingWaterPageSchema,
  listSchleswigBathingWaters,
} from '../src/modules/bathing-waters.ts';
import {
  chargingStationPageSchema,
  listSchleswigChargingStations,
} from '../src/modules/car-charging-stations.ts';
import {
  populationPageSchema,
  listSchleswigPopulationForecast,
} from '../src/modules/population-forecast.ts';

// Theme tools group related datasets behind one tool each, so AI clients choose
// between a few clearly separated topics instead of many similar tools. Dataset
// names match the REST routes. REST keeps one route per dataset.

const pageDescription =
  ' List datasets return metadata, source credit, notices and a page of records. Optional id is exact; q is a case-insensitive substring search. limit defaults to 20 (maximum 100); offset defaults to 0. Use result.pagination.nextOffset for the next page.';

function themeInput<const D extends readonly [string, ...string[]]>(
  datasets: D,
) {
  return z.strictObject({
    dataset: z.enum(datasets),
    ...listQuerySchema.shape,
  });
}

function listQuery(input: ListQuery & { dataset: string }): ListQuery {
  const { id, q, limit, offset } = input;
  return { id, q, limit, offset };
}

export const themeTools = {
  water: {
    name: 'query_schleswig_water',
    datasets: ['water-level', 'water-level-history', 'bathing-waters'],
  },
  population: {
    name: 'query_schleswig_population',
    datasets: ['population-forecast', 'population', 'population-movement'],
  },
  economy: {
    name: 'query_schleswig_economy',
    datasets: ['construction', 'tourism', 'municipal-taxes'],
  },
  mobility: {
    name: 'query_schleswig_mobility',
    datasets: ['charging-stations'],
  },
  places: {
    name: 'query_schleswig_places',
    datasets: ['addresses', 'monuments'],
  },
} as const;

export function registerThemeTools(
  server: McpServer,
  getWaterLevel: GetWaterLevel,
) {
  const annotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  };

  const water = themeTools.water;
  server.registerTool(
    water.name,
    {
      title: 'Schleswig water',
      description:
        'Water in Schleswig, Germany. dataset "water-level": latest PEGELONLINE gauge reading with timestamp, age and stale status; the reading is not water depth, a flood warning or a safety assessment; id, q, limit and offset are ignored. dataset "water-level-history": daily minimum, mean and maximum per calendar day (Europe/Berlin), newest first; id is the date and q matches date prefixes such as 2026-10; history starts with the first collection run. dataset "bathing-waters": bathing-water reference locations; does not report current water quality or swimming safety.' +
        pageDescription,
      inputSchema: themeInput(water.datasets),
      outputSchema: mcpOutputSchema(
        z.strictObject({
          dataset: z.enum(water.datasets),
          result: z.union([
            waterLevelSchema,
            waterLevelHistoryPageSchema,
            bathingWaterPageSchema,
          ]),
        }),
      ),
      annotations: { ...annotations, openWorldHint: true },
    },
    (input) =>
      toolResult(async () => ({
        dataset: input.dataset,
        result:
          input.dataset === 'water-level'
            ? await getWaterLevel()
            : input.dataset === 'water-level-history'
              ? await listSchleswigWaterLevelHistory(listQuery(input))
              : await listSchleswigBathingWaters(listQuery(input)),
      })),
  );

  const population = themeTools.population;
  server.registerTool(
    population.name,
    {
      title: 'Schleswig population',
      description:
        'Population of Schleswig, Germany. dataset "population-forecast": projection indicators and their year values; historical inputs and projections must not all be treated as observations; pagination counts indicators, result.metadata.recordCount counts source documents. dataset "population": official population on 31 December and average age, by sex, since 2008. dataset "population-movement": official annual births, deaths and moves across the municipal border. Official series have one record per measure and breakdown with values per period; null values keep the official sign in marker.' +
        pageDescription,
      inputSchema: themeInput(population.datasets),
      outputSchema: mcpOutputSchema(
        z.strictObject({
          dataset: z.enum(population.datasets),
          result: z.union([populationPageSchema, statisticsPageSchema]),
        }),
      ),
      annotations: { ...annotations, openWorldHint: false },
    },
    (input) =>
      toolResult(async () => ({
        dataset: input.dataset,
        result:
          input.dataset === 'population-forecast'
            ? await listSchleswigPopulationForecast(listQuery(input))
            : await listSchleswigStatistics(input.dataset, listQuery(input)),
      })),
  );

  const economy = themeTools.economy;
  server.registerTool(
    economy.name,
    {
      title: 'Schleswig economy',
      description:
        'Economy of Schleswig, Germany, from official statistics (Regionaldatenbank Deutschland). dataset "construction": annual permits and completions of new residential buildings, dwellings and living space. dataset "tourism": annual open accommodation establishments, beds, guest arrivals and overnight stays. dataset "municipal-taxes": annual tax rates (Hebesätze), tax revenue and municipal tax shares. One record per measure and breakdown with values per period; null values keep the official sign in marker.' +
        pageDescription,
      inputSchema: themeInput(economy.datasets),
      outputSchema: mcpOutputSchema(
        z.strictObject({
          dataset: z.enum(economy.datasets),
          result: statisticsPageSchema,
        }),
      ),
      annotations: { ...annotations, openWorldHint: false },
    },
    (input) =>
      toolResult(async () => ({
        dataset: input.dataset,
        result: await listSchleswigStatistics(input.dataset, listQuery(input)),
      })),
  );

  const mobility = themeTools.mobility;
  server.registerTool(
    mobility.name,
    {
      title: 'Schleswig mobility',
      description:
        'Mobility in Schleswig, Germany. dataset "charging-stations": registered charging infrastructure by operator, display name or address; register status is not live connector availability.' +
        pageDescription,
      inputSchema: themeInput(mobility.datasets),
      outputSchema: mcpOutputSchema(
        z.strictObject({
          dataset: z.enum(mobility.datasets),
          result: chargingStationPageSchema,
        }),
      ),
      annotations: { ...annotations, openWorldHint: false },
    },
    (input) =>
      toolResult(async () => ({
        dataset: input.dataset,
        result: await listSchleswigChargingStations(listQuery(input)),
      })),
  );

  const places = themeTools.places;
  server.registerTool(
    places.name,
    {
      title: 'Schleswig places',
      description:
        'Places in Schleswig, Germany. dataset "addresses": official addresses from a prepared ALKIS snapshot, searchable by street, house number and postal code, coordinates in EPSG:4326. dataset "monuments": listed cultural monuments by name or address; the register is not exhaustive.' +
        pageDescription,
      inputSchema: themeInput(places.datasets),
      outputSchema: mcpOutputSchema(
        z.strictObject({
          dataset: z.enum(places.datasets),
          result: z.union([addressPageSchema, monumentPageSchema]),
        }),
      ),
      annotations: { ...annotations, openWorldHint: false },
    },
    (input) =>
      toolResult(async () => ({
        dataset: input.dataset,
        result:
          input.dataset === 'addresses'
            ? await listSchleswigAddresses(listQuery(input))
            : await listSchleswigMonuments(listQuery(input)),
      })),
  );
}
