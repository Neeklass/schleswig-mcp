import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { mcpOutputSchema } from './output-schema.ts';
import { registerThemeTools } from './themes.ts';
import { toolResult } from './tool-result.ts';
import {
  getSchleswigWaterLevel,
  waterLevelSchema,
} from '../src/modules/water-level.ts';
import type { GetWaterLevel } from '../src/modules/water-level.ts';
import { listQuerySchema } from '../src/shared/pagination.ts';
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

const listDescription =
  ' Returns metadata, source credit, notices and a page of records. Optional id is exact; q is a case-insensitive substring search. limit defaults to 20 (maximum 100); offset defaults to 0. Use pagination.nextOffset for the next page.';

export function createSchleswigMcp(
  getWaterLevel: GetWaterLevel = getSchleswigWaterLevel,
) {
  return createMcpHandler(
    () => {
      const server = new McpServer({ name: 'schleswig-mcp', version: '0.1.0' });
      server.registerTool(
        'get_schleswig_water_level',
        {
          title: 'Schleswig water level',
          description:
            'Deprecated: use query_schleswig_water with dataset "water-level". ' +
            'Get the latest available PEGELONLINE water-level measurement for Schleswig, Germany. Includes timestamp, age, station, source and stale status. The gauge reading is not water depth. Measurements are unvalidated raw data.',
          inputSchema: z.strictObject({}),
          outputSchema: waterLevelSchema,
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
          },
        },
        () => toolResult(getWaterLevel),
      );
      const annotations = {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      };
      server.registerTool(
        'list_schleswig_addresses',
        {
          description:
            'Deprecated: use query_schleswig_places with dataset "addresses". ' +
            'Find official Schleswig addresses in a prepared ALKIS snapshot. Search street, house number and postal code. Coordinates use EPSG:4326.' +
            listDescription,
          inputSchema: listQuerySchema,
          outputSchema: addressPageSchema,
          annotations,
        },
        (input) => toolResult(() => listSchleswigAddresses(input)),
      );
      server.registerTool(
        'list_schleswig_monuments',
        {
          description:
            'Deprecated: use query_schleswig_places with dataset "monuments". ' +
            'Find listed Schleswig cultural monuments in a prepared register snapshot. Search name or address. This register is not exhaustive.' +
            listDescription,
          inputSchema: listQuerySchema,
          outputSchema: monumentPageSchema,
          annotations,
        },
        (input) => toolResult(() => listSchleswigMonuments(input)),
      );
      server.registerTool(
        'list_schleswig_bathing_waters',
        {
          description:
            'Deprecated: use query_schleswig_water with dataset "bathing-waters". ' +
            'Find Schleswig bathing-water reference locations by name or keyword. Does not report current water quality or swimming safety.' +
            listDescription,
          inputSchema: listQuerySchema,
          outputSchema: mcpOutputSchema(bathingWaterPageSchema),
          annotations,
        },
        (input) => toolResult(() => listSchleswigBathingWaters(input)),
      );
      server.registerTool(
        'list_schleswig_charging_stations',
        {
          description:
            'Deprecated: use query_schleswig_mobility with dataset "charging-stations". ' +
            'Find registered Schleswig charging infrastructure by operator, display name or address. Register status is not live connector availability.' +
            listDescription,
          inputSchema: listQuerySchema,
          outputSchema: mcpOutputSchema(chargingStationPageSchema),
          annotations,
        },
        (input) => toolResult(() => listSchleswigChargingStations(input)),
      );
      server.registerTool(
        'list_schleswig_population_forecast',
        {
          description:
            'Deprecated: use query_schleswig_population with dataset "population-forecast". ' +
            'Read Schleswig population projection indicators and their year values. Search indicator name. Historical inputs and projections must not all be treated as observations. Pagination counts indicators; metadata.recordCount counts source documents.' +
            listDescription,
          inputSchema: listQuerySchema,
          outputSchema: mcpOutputSchema(populationPageSchema),
          annotations,
        },
        (input) => toolResult(() => listSchleswigPopulationForecast(input)),
      );
      registerThemeTools(server, getWaterLevel);
      return server;
    },
    { maxRequestBodySize: 64 * 1024, maxSubscriptions: 0 },
  );
}
