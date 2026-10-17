import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { publicError } from '../src/shared/errors.ts';
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

async function toolResult(action: () => Promise<object>) {
  try {
    const result = await action();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      structuredContent: { ...result },
    };
  } catch (error) {
    const body = publicError(error);
    if (body.error.code === 'INTERNAL_ERROR') console.error(error);
    return {
      isError: true,
      content: [{ type: 'text' as const, text: JSON.stringify(body) }],
    };
  }
}
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
            'Find Schleswig bathing-water reference locations by name or keyword. Does not report current water quality or swimming safety.' +
            listDescription,
          inputSchema: listQuerySchema,
          outputSchema: bathingWaterPageSchema,
          annotations,
        },
        (input) => toolResult(() => listSchleswigBathingWaters(input)),
      );
      server.registerTool(
        'list_schleswig_charging_stations',
        {
          description:
            'Find registered Schleswig charging infrastructure by operator, display name or address. Register status is not live connector availability.' +
            listDescription,
          inputSchema: listQuerySchema,
          outputSchema: chargingStationPageSchema,
          annotations,
        },
        (input) => toolResult(() => listSchleswigChargingStations(input)),
      );
      server.registerTool(
        'list_schleswig_population_forecast',
        {
          description:
            'Read Schleswig population projection indicators and their year values. Search indicator name. Historical inputs and projections must not all be treated as observations. Pagination counts indicators; metadata.recordCount counts source documents.' +
            listDescription,
          inputSchema: listQuerySchema,
          outputSchema: populationPageSchema,
          annotations,
        },
        (input) => toolResult(() => listSchleswigPopulationForecast(input)),
      );
      return server;
    },
    { maxRequestBodySize: 64 * 1024, maxSubscriptions: 0 },
  );
}
