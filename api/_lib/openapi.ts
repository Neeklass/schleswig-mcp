import { z } from 'zod';
import { waterLevelSchema } from '../../src/modules/water-level.ts';
import {
  waterLevelHistoryPageSchema,
  listSchleswigWaterLevelHistory,
} from '../../src/modules/water-level-history.ts';
import {
  addressPageSchema,
  listSchleswigAddresses,
} from '../../src/modules/addresses.ts';
import {
  monumentPageSchema,
  listSchleswigMonuments,
} from '../../src/modules/monuments.ts';
import {
  bathingWaterPageSchema,
  listSchleswigBathingWaters,
} from '../../src/modules/bathing-waters.ts';
import {
  chargingStationPageSchema,
  listSchleswigChargingStations,
} from '../../src/modules/car-charging-stations.ts';
import {
  populationPageSchema,
  listSchleswigPopulationForecast,
} from '../../src/modules/population-forecast.ts';
import {
  statisticsPageSchema,
  listSchleswigStatistics,
} from '../../src/modules/statistics.ts';
import { listQuerySchema } from '../../src/shared/pagination.ts';

// Illustrative values, never a current measurement. Building documentation is offline.
export const waterLevelExample = waterLevelSchema.parse({
  station: {
    id: '09370c05-1041-4395-a5d4-b8db6e59c4c8',
    number: '9610040',
    name: 'SCHLESWIG',
    water: 'OSTSEE',
  },
  measurement: {
    value: 521,
    unit: 'cm',
    timestamp: '2026-10-14T13:24:00Z',
    reference: 'gauge_zero',
  },
  freshness: {
    fetchedAt: '2026-10-14T13:25:00Z',
    ageSeconds: 60,
    isStale: false,
    staleAfterSeconds: 900,
  },
  source: {
    name: 'PEGELONLINE',
    url: 'https://pegelonline.wsv.de/webservices/rest-api/v2/stations/09370c05-1041-4395-a5d4-b8db6e59c4c8.json?includeTimeseries=true&includeCurrentMeasurement=true',
    license: 'DL-DE-Zero-2.0',
    licenseUrl: 'https://www.govdata.de/dl-de/zero-2-0',
  },
  notices: [
    'Water level relative to the station gauge zero; this is not water depth.',
    'PEGELONLINE provides unvalidated raw measurements.',
  ],
});

export const restDocumentation = [
  {
    path: 'water-level',
    name: 'WaterLevel',
    summary: 'Latest water level',
    provider: 'pegelonline',
    schema: waterLevelSchema,
    example: async () => waterLevelExample,
    description:
      'Live PEGELONLINE measurement for station SCHLESWIG. No query parameters. Values are centimetres relative to gauge zero, not water depth. Unvalidated raw measurements are not navigation advice or flood warnings. Measurements older than 15 minutes still return 200 with freshness.isStale=true. Each request fetches upstream data with a five-second timeout; avoid unnecessary polling.',
  },
  {
    path: 'water-level-history',
    name: 'WaterLevelHistoryPage',
    summary: 'List daily water levels',
    provider: 'pegelonline',
    schema: waterLevelHistoryPageSchema,
    example: () => listSchleswigWaterLevelHistory({ limit: 1 }),
    description:
      'Daily minimum, mean and maximum of raw PEGELONLINE measurements at station SCHLESWIG, one record per calendar day in Europe/Berlin, newest first. The record ID is the date; q matches date prefixes such as 2026-10. A scheduled pipeline appends complete days after review; stored days are never rewritten. PEGELONLINE only serves the last 31 days, so the history starts with the first collection run. Values are centimetres relative to gauge zero, not water depth; measurementCount below 1440 indicates source gaps.',
  },
  {
    path: 'addresses',
    name: 'AddressPage',
    summary: 'List addresses',
    provider: 'geodata',
    schema: addressPageSchema,
    example: () => listSchleswigAddresses({ limit: 1 }),
    description:
      'Prepared ALKIS address snapshot for Schleswig. Search street, house number/addition and postal code. Coordinates use EPSG:4326. Postal codes were not reconciled with Deutsche Post. Nullable addressExtra and postalCode are explicit nulls, not omitted properties.',
  },
  {
    path: 'monuments',
    name: 'MonumentPage',
    summary: 'List cultural monuments',
    provider: 'opendata-sh',
    schema: monumentPageSchema,
    example: () => listSchleswigMonuments({ limit: 1 }),
    description:
      'Prepared, non-exhaustive cultural monument register. Search name or address. Numeric source object identifiers are exposed as string IDs. Optional address, protection and photo fields may be absent. Photo URLs are references; images are not fetched or hosted.',
  },
  {
    path: 'bathing-waters',
    name: 'BathingWaterPage',
    summary: 'List bathing waters',
    provider: 'govdata',
    schema: bathingWaterPageSchema,
    example: () => listSchleswigBathingWaters({ limit: 1 }),
    description:
      'Prepared bathing-water reference locations. Search name or keywords. No current water quality, opening status or swimming safety assessment. Use EPSG:4326 longitude/latitude: the source declares EPSG:4647 for projected coordinates, but its eastings omit the zone prefix. The original values and declaration remain documented in metadata.projectedCoordinates.',
  },
  {
    path: 'charging-stations',
    name: 'ChargingStationPage',
    summary: 'List charging stations',
    provider: 'bundesnetzagentur',
    schema: chargingStationPageSchema,
    example: () => listSchleswigChargingStations({ limit: 1 }),
    description:
      'Prepared, non-exhaustive charging infrastructure register. Search operator, display name or street/house number. Register status does not indicate live connector availability. Opening hours retain the source code without separate weekday/time details. Nullable text fields remain explicit nulls. Coordinates use EPSG:4326.',
  },
  {
    path: 'population-forecast',
    name: 'PopulationPage',
    summary: 'List population forecast indicators',
    provider: 'govdata',
    schema: populationPageSchema,
    example: () => listSchleswigPopulationForecast({ limit: 1 }),
    description:
      'Prepared indicators with year/value pairs for 2018, 2020, 2030, 2035 and 2040; no 2025 axis. Search indicator name. Historical inputs and projections are not all observed counts. Units vary by indicator; null values are missing, not zero. Pagination counts 39 indicators, while metadata.recordCount counts the single Gold source document.',
  },
  {
    path: 'population',
    name: 'PopulationStatisticsPage',
    summary: 'List population statistics',
    provider: 'regionalstatistik',
    schema: statisticsPageSchema,
    example: () => listSchleswigStatistics('population', { limit: 1 }),
    description:
      'Official population on 31 December by sex (table 12411-01-01-5) and average age by sex (12411-07-01-5) since 2008. Each record is one series: a measure from one table with an optional breakdown (e.g. sex) and its values per period. Search statistic, measure and breakdown labels. Values are published figures under DL-DE-BY-2.0; null values carry the official GENESIS sign in marker, and "-" means exactly zero. Gold files are refreshed by a reviewed pipeline.',
  },
  {
    path: 'population-movement',
    name: 'PopulationMovementPage',
    summary: 'List births, deaths and migration',
    provider: 'regionalstatistik',
    schema: statisticsPageSchema,
    example: () => listSchleswigStatistics('population-movement', { limit: 1 }),
    description:
      'Official annual live births (12612-01-01-5) and deaths (12613-01-01-5) by sex, and moves into and out of Schleswig across municipal borders (12711-91-01-5), since 2008. Each record is one series: a measure from one table with an optional breakdown (e.g. sex) and its values per period. Search statistic, measure and breakdown labels. Values are published figures under DL-DE-BY-2.0; null values carry the official GENESIS sign in marker, and "-" means exactly zero. Gold files are refreshed by a reviewed pipeline.',
  },
  {
    path: 'construction',
    name: 'ConstructionPage',
    summary: 'List residential construction statistics',
    provider: 'regionalstatistik',
    schema: statisticsPageSchema,
    example: () => listSchleswigStatistics('construction', { limit: 1 }),
    description:
      'Official annual permits (31111-01-02-5) and completions (31121-01-02-5) of new residential buildings: buildings and dwellings by building size, and living space, since 2008. Each record is one series: a measure from one table with an optional breakdown (e.g. sex) and its values per period. Search statistic, measure and breakdown labels. Values are published figures under DL-DE-BY-2.0; null values carry the official GENESIS sign in marker, and "-" means exactly zero. Gold files are refreshed by a reviewed pipeline.',
  },
  {
    path: 'tourism',
    name: 'TourismPage',
    summary: 'List tourism statistics',
    provider: 'regionalstatistik',
    schema: statisticsPageSchema,
    example: () => listSchleswigStatistics('tourism', { limit: 1 }),
    description:
      'Official annual accommodation statistics (45412-01-02-5): open establishments, beds, guest arrivals and overnight stays, since 2008. Covers establishments above the survey threshold only. Each record is one series: a measure from one table with an optional breakdown (e.g. sex) and its values per period. Search statistic, measure and breakdown labels. Values are published figures under DL-DE-BY-2.0; null values carry the official GENESIS sign in marker, and "-" means exactly zero. Gold files are refreshed by a reviewed pipeline.',
  },
  {
    path: 'municipal-taxes',
    name: 'MunicipalTaxesPage',
    summary: 'List municipal tax statistics',
    provider: 'regionalstatistik',
    schema: statisticsPageSchema,
    example: () => listSchleswigStatistics('municipal-taxes', { limit: 1 }),
    description:
      'Official annual local tax rates (Hebesätze) for property tax A and B and business tax, tax revenue and municipal shares of income and turnover tax (71231-01-03-5), since 2016. Each record is one series: a measure from one table with an optional breakdown (e.g. sex) and its values per period. Search statistic, measure and breakdown labels. Values are published figures under DL-DE-BY-2.0; null values carry the official GENESIS sign in marker, and "-" means exactly zero. Gold files are refreshed by a reviewed pipeline.',
  },
] as const;

const parameterDescriptions = {
  id: 'Exact, case-sensitive record ID as a string (1–100 characters after trimming). Combined with q using AND.',
  q: 'Case-insensitive substring search (1–200 characters after trimming); searched fields are documented per endpoint. No wildcard syntax.',
  limit: 'Page size, 1–100; default 20. Supply decimal digits only.',
  offset:
    'Zero-based offset in the filtered list; default 0, at most 9007199254740991. Supply decimal digits only.',
};

const errorSchema = z.strictObject({
  error: z.strictObject({ code: z.string(), message: z.string() }),
});
const failures = {
  400: [
    'BAD_REQUEST',
    'Invalid query parameters. Use id, q, limit (1-100), and offset (0 or greater) for dataset lists; water-level accepts none.',
  ],
  403: ['FORBIDDEN', 'Host or Origin is not allowed.'],
  404: ['NOT_FOUND', 'Route not found.'],
  405: ['METHOD_NOT_ALLOWED', 'Use GET for this endpoint.'],
  500: ['INTERNAL_ERROR', 'An unexpected error occurred.'],
  502: ['UPSTREAM_UNAVAILABLE', 'PEGELONLINE is currently unavailable.'],
  503: ['DATA_NOT_FOUND', 'The prepared dataset is missing.'],
  504: ['UPSTREAM_TIMEOUT', 'PEGELONLINE did not respond in time.'],
} as const;

export async function createOpenApi() {
  const schemas: Record<string, z.core.JSONSchema.BaseSchema> = {
    Error: z.toJSONSchema(errorSchema),
  };
  const paths: Record<string, unknown> = {};
  for (const endpoint of restDocumentation) {
    const water = endpoint.path === 'water-level';
    const example = endpoint.schema.parse(await endpoint.example());
    schemas[endpoint.name] = z.toJSONSchema(endpoint.schema);
    const responses: Record<string, unknown> = {
      '200': {
        description: water
          ? 'Latest available reading, including freshness and source license.'
          : 'A page of records with complete dataset metadata, source attribution and notices. An unmatched filter or out-of-range offset returns an empty data array with HTTP 200.',
        headers: {
          'Cache-Control': {
            schema: { type: 'string', const: 'no-store' },
            description:
              'Instructs HTTP clients and intermediaries not to store the response.',
          },
          'X-Content-Type-Options': {
            schema: { type: 'string', const: 'nosniff' },
          },
        },
        content: {
          'application/json': {
            schema: { $ref: `#/components/schemas/${endpoint.name}` },
            examples: {
              sample: {
                summary: water
                  ? 'Synthetic historical reading, not a current measurement'
                  : 'First record from the packaged snapshot (limit=1)',
                value: example,
              },
            },
          },
        },
      },
    };
    for (const [status, [code, message]] of Object.entries(failures)) {
      if (!water && (status === '502' || status === '504')) continue;
      const measurementUnavailable = water && status === '503';
      responses[status] = {
        description:
          status === '503'
            ? water
              ? 'No current measurement available.'
              : 'Prepared dataset missing, unavailable or invalid (DATA_NOT_FOUND, SOURCE_UNAVAILABLE or INVALID_SOURCE_DATA).'
            : status === '502'
              ? 'Unavailable or invalid upstream response (UPSTREAM_UNAVAILABLE or INVALID_UPSTREAM_RESPONSE).'
              : message,
        ...(status === '405'
          ? { headers: { Allow: { schema: { type: 'string', const: 'GET' } } } }
          : {}),
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: {
              error: {
                code: measurementUnavailable ? 'MEASUREMENT_UNAVAILABLE' : code,
                message: measurementUnavailable
                  ? 'No current water-level measurement is available for Schleswig.'
                  : message,
              },
            },
          },
        },
      };
    }
    paths[`/api/v1/schleswig/${endpoint.path}`] = {
      get: {
        operationId:
          endpoint.name === 'WaterLevel'
            ? 'getWaterLevel'
            : `list${endpoint.name.replace('Page', '')}`,
        summary: endpoint.summary,
        description:
          endpoint.description +
          (water
            ? ''
            : '\n\nExample request: `GET /api/v1/schleswig/' +
              endpoint.path +
              '?limit=1&offset=0`. Lists default to 20 records (maximum 100). Follow pagination.nextOffset until null. Source order is stable within a snapshot, but can change after an update. Unknown or repeated parameters are rejected; empty strings are invalid. Metadata describes the full snapshot, not this page.'),
        parameters: water
          ? []
          : Object.entries(listQuerySchema.shape).map(([name, schema]) => ({
              name,
              in: 'query',
              required: false,
              description:
                parameterDescriptions[
                  name as keyof typeof parameterDescriptions
                ],
              schema: z.toJSONSchema(schema, { io: 'input' }),
              ...(name === 'limit'
                ? { example: 1 }
                : name === 'offset'
                  ? { example: 0 }
                  : {}),
            })),
        responses,
      },
    };
  }
  return {
    openapi: '3.1.0',
    jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
    info: {
      title: 'Schleswig MCP REST API',
      version: '1.0.0',
      description:
        'An independent open-data project for Schleswig city, Germany (AGS 01059075), not operated or endorsed by the City of Schleswig. All endpoints use GET and return JSON. No API key is required. Browser requests must be same-origin; cross-origin access is not enabled. Host and Origin checks apply.\n\nWater level is fetched live; all other datasets are prepared snapshots. Snapshot responses contain metadata, data, pagination and notices. metadata.license.attribution retains source credits; preserve required credits, license URLs and processing notices when reusing data. Dataset licenses differ and do not license this application. German original content is preserved.\n\nmetadata.dates separates dataAsOf, sourcePublishedAt, sourceUpdatedAt, retrievedAt and curatedAt. Null means unknown or unproven, not the build date. Coordinates, when present, use EPSG:4326 unless explicitly documented otherwise. Optional properties can be absent; nullable properties can contain explicit nulls. The server also validates cross-field relationships that are not fully represented in the generated schemas.\n\nList examples contain one packaged snapshot record. The water-level example is synthetic, not a current measurement. See [MCP documentation](/mcp-docs) for the Streamable HTTP service, which returns the same domain data.',
    },
    servers: [
      { url: '/', description: 'This origin (local, preview or production)' },
    ],
    paths,
    components: { schemas },
  };
}
