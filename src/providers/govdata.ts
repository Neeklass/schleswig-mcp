// Sources discovered through GovData; downloads come directly from their publishers.
import { z } from 'zod';
import { bathingWaterSchema } from '../modules/models/bathing-waters.ts';
import { goldDatasetSchema, uniqueIds } from '../shared/gold-metadata.ts';
import { cachedGold, curatedRoot } from '../shared/gold-reader.ts';

export const bathingGoldSchema = goldDatasetSchema(
  bathingWaterSchema,
  'schleswig-bathing-waters',
).superRefine((value, context) => {
  uniqueIds(value.data, (record) => record.id, context);
  if (
    value.metadata.coordinateReferenceSystem !== 'EPSG:4326' ||
    !value.metadata.projectedCoordinates
  )
    context.addIssue({
      code: 'custom',
      message: 'Bathing-water coordinate metadata is missing.',
    });
});
export const getBathingWaterDataset = cachedGold(
  new URL('govdata/bathing_waters.json', curatedRoot),
  bathingGoldSchema,
);

const regionGoldSchema = z.strictObject({
  friendlyUrl: z.string(),
  name: z.literal('Schleswig'),
  title: z.string(),
  id: z.number().int(),
  ags: z.literal('01059075'),
  ars: z.literal('010590075075'),
  type: z.literal('GEMEINDE'),
  demographicType: z.number().int(),
  parent: z.string(),
});
const yearSchema = z.number().int().min(1900).max(2200);
const indicatorDefinitionSchema = z.strictObject({
  id: z.number().int(),
  name: z.string(),
  title: z.string(),
  type: z.string(),
  explanation: z.string(),
  hint: z.string(),
  calculation: z.string(),
  source: z.string(),
  unit: z.string().min(1),
  decimalPlaces: z.number().int().nonnegative(),
  friendlyUrl: z.string(),
  years: z.array(yearSchema),
  minimumRegionType: z.string(),
  maximumRegionType: z.string(),
  topLowRegionsAvailable: z.boolean(),
  topics: z.array(z.string()),
  colorSchema: z.string(),
});
const populationDocumentSchema = z
  .strictObject({
    regionsAndRegionFilters: z.array(regionGoldSchema).length(1),
    indicatorsAndTopics: z
      .array(
        z.strictObject({
          id: z.number().int(),
          name: z.string(),
          title: z.string(),
          friendlyUrl: z.string(),
          explanation: z.string().nullable(),
          type: z.string(),
          comparisonYear: yearSchema.nullable(),
          comparisonYearTitle: z.string().nullable(),
          indicators: z.array(indicatorDefinitionSchema),
          topics: z.array(z.never()),
        }),
      )
      .min(1),
    renderer: z.string(),
    mapOutline: z.null(),
    activeSelection: z.null(),
    years: z.array(yearSchema).min(1),
    data: z.strictObject({
      type: z.string(),
      regions: z.array(regionGoldSchema).length(1),
      source: z.string().min(1),
      indicators: z
        .array(
          z.strictObject({
            id: z.number().int(),
            friendlyUrl: z.string(),
            name: z.string().min(1),
            unit: z.string().min(1),
            minValue: z.number().nullable(),
            maxValue: z.number().nullable(),
            regionYearValues: z.array(z.array(z.number().nullable())).length(1),
          }),
        )
        .min(1),
    }),
  })
  .superRefine((document, context) => {
    const definitions = document.indicatorsAndTopics.flatMap(
      (topic) => topic.indicators,
    );
    uniqueIds(document.data.indicators, (record) => record.id, context);
    uniqueIds(definitions, (record) => record.id, context);
    if (
      new Set(document.years).size !== document.years.length ||
      JSON.stringify(document.data.regions) !==
        JSON.stringify(document.regionsAndRegionFilters)
    )
      context.addIssue({
        code: 'custom',
        message: 'Ambiguous years or inconsistent region selection.',
      });
    for (const indicator of document.data.indicators) {
      const definition = definitions.find((item) => item.id === indicator.id);
      const values = indicator.regionYearValues[0] ?? [];
      const present = values.filter((value) => value !== null);
      if (
        !definition ||
        definition.name !== indicator.name ||
        definition.unit !== indicator.unit ||
        values.length !== document.years.length ||
        indicator.minValue !== (present.length ? Math.min(...present) : null) ||
        indicator.maxValue !== (present.length ? Math.max(...present) : null)
      )
        context.addIssue({
          code: 'custom',
          message: 'Invalid indicator definition, dimensions or extrema.',
        });
    }
    if (definitions.length !== document.data.indicators.length)
      context.addIssue({
        code: 'custom',
        message: 'Indicator definitions do not match the data.',
      });
  });
export const populationGoldSchema = goldDatasetSchema(
  populationDocumentSchema,
  'schleswig-population-forecast',
  'CC0-1.0',
).superRefine((value, context) => {
  if (
    value.data.length !== 1 ||
    JSON.stringify(value.metadata.temporalCoverage?.years) !==
      JSON.stringify(value.data[0]?.years)
  )
    context.addIssue({
      code: 'custom',
      message:
        'Expected one projection document and matching temporal coverage.',
    });
});
export const getPopulationDataset = cachedGold(
  new URL('govdata/population_forecast.json', curatedRoot),
  populationGoldSchema.transform((value) => {
    const document = value.data[0]!;
    const definitions = document.indicatorsAndTopics.flatMap(
      (topic) => topic.indicators,
    );
    return {
      metadata: value.metadata,
      data: document.data.indicators.map((indicator) => {
        const definition = definitions.find(
          (item) => item.id === indicator.id,
        )!;
        return {
          id: String(indicator.id),
          name: indicator.name,
          unit: indicator.unit,
          explanation: definition.explanation,
          calculation: definition.calculation,
          source: definition.source,
          values: document.years.map((year, index) => ({
            year,
            value: indicator.regionYearValues[0]![index]!,
          })),
        };
      }),
    };
  }),
);
import {
  DatasetError,
  readCsv,
  readJson,
  readRemoteDataset,
  requireRecords,
} from '../shared/dataset-io.ts';
import type { DatasetFetchOptions } from '../shared/dataset-io.ts';

export const BATHING_WATERS_URL =
  'https://efi2.schleswig-holstein.de/bg/opendata/v_badegewaesser_odata.csv';

const rowSchema = z.array(z.string()).length(29);
const recordSchema = z.object({
  id: z.string().regex(/^DESH_PR_\d+$/),
  name: z.string().min(1),
  waterType: z.string().min(1),
  municipality: z.string().min(1),
  municipalityId: z.literal('01059075'),
  longitude: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .transform(Number)
    .pipe(z.number().min(-180).max(180)),
  latitude: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .transform(Number)
    .pipe(z.number().min(-90).max(90)),
  description: z.string(),
});

export async function fetchSchleswigBathingWaters(
  options: DatasetFetchOptions = {},
) {
  const records = await readRemoteDataset(
    BATHING_WATERS_URL,
    async (bytes) => {
      const selected: z.output<typeof recordSchema>[] = [];
      // The official CSV also contains literal quotes inside unquoted fields.
      await readCsv(
        bytes,
        { delimiter: '|', encoding: 'latin1', relax_quotes: true },
        (raw) => {
          const row = rowSchema.parse(raw);
          const district = z
            .string()
            .regex(/^\d{2}$/)
            .parse(row[18]);
          const municipality = z
            .string()
            .regex(/^\d{3}$/)
            .parse(row[20]);
          if (district !== '59' || municipality !== '075') return;
          selected.push(
            recordSchema.parse({
              id: row[0],
              name: row[3],
              waterType: row[4],
              municipality: row[21],
              municipalityId: '010' + district + municipality,
              longitude: row[24],
              latitude: row[25],
              description: row[26],
            }),
          );
        },
      );
      return requireRecords(selected);
    },
    options,
    4 * 1_024 * 1_024,
  );
  return {
    records,
    retrievedAt: new Date().toISOString(),
    source: {
      name: 'Ministerium für Justiz und Gesundheit Schleswig-Holstein',
      url: BATHING_WATERS_URL,
      dataAsOf: null,
      license: 'CC-BY-4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      attribution: 'Sozialministerium S-H',
      changes:
        'Selected Schleswig by municipality key; normalized fields and coordinates.',
    },
    notices: [
      'Reference data only; no current water quality, opening status or swimming safety assessment.',
    ],
  };
}

export type BathingWaterRecord = Awaited<
  ReturnType<typeof fetchSchleswigBathingWaters>
>['records'][number];

export const POPULATION_URL =
  'https://www.wegweiser-kommune.de/data-api/rest/statistics/data/demografie-bevoelkerungsstand+demografische-prognose-bewegung+bevoelkerung-nach-altersgruppen-1+anteile-der-altersgruppen-1-1+entwicklung-der-altersgruppen-1+generationsentwicklung+gemeinden-und-staedte-und-landkreise-aus-schleswig-holstein+schleswig-holstein+2018-2040+tabelle';

const projectionSchema = z
  .object({
    years: z.array(z.number().int().min(1900).max(2200)).min(1),
    data: z.object({
      regions: z
        .array(
          z.object({
            ags: z.string().regex(/^\d{8}$/),
            name: z.string().min(1),
          }),
        )
        .min(1),
      indicators: z
        .array(
          z.object({
            id: z.number().int(),
            name: z.string().min(1),
            unit: z.string().min(1),
            regionYearValues: z.array(z.array(z.number().nullable())),
          }),
        )
        .min(1),
      source: z.string().min(1),
    }),
  })
  .superRefine(({ years, data }, context) => {
    if (
      new Set(years).size !== years.length ||
      new Set(data.regions.map((r) => r.ags)).size !== data.regions.length ||
      new Set(data.indicators.map((i) => i.id)).size !==
        data.indicators.length ||
      data.indicators.some(
        (i) =>
          i.regionYearValues.length !== data.regions.length ||
          i.regionYearValues.some((values) => values.length !== years.length),
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Ambiguous identifiers or mismatched region/year dimensions.',
      });
    }
  });

export async function fetchSchleswigPopulationProjection(
  options: DatasetFetchOptions = {},
) {
  const projection = await readRemoteDataset(
    POPULATION_URL,
    async (bytes) => {
      const data = projectionSchema.parse(await readJson(bytes));
      const regionIndex = data.data.regions.findIndex(
        (region) => region.ags === '01059075',
      );
      const region = data.data.regions[regionIndex];
      if (!region)
        throw new DatasetError(
          'DATA_NOT_FOUND',
          'Schleswig is absent from the population projection.',
        );
      return {
        municipality: { id: region.ags, name: region.name },
        indicators: data.data.indicators.map((indicator) => ({
          id: String(indicator.id),
          name: indicator.name,
          unit: indicator.unit,
          values: data.years.map((year, yearIndex) => ({
            year,
            // Dimensions are checked above. Missing source values remain null.
            value: indicator.regionYearValues[regionIndex]?.[yearIndex] ?? null,
          })),
        })),
        sourceCredit: data.data.source,
      };
    },
    options,
  );
  return {
    ...projection,
    retrievedAt: new Date().toISOString(),
    source: {
      name: 'Bertelsmann Stiftung / Wegweiser Kommune',
      url: POPULATION_URL,
      dataAsOf: null,
      license: 'CC0-1.0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attribution: 'Bertelsmann Stiftung; ' + projection.sourceCredit,
      changes:
        'Selected Schleswig; associated values with explicit years and indicators.',
    },
    notices: [
      'Projection dataset with historical inputs; values must not all be treated as observed population counts.',
    ],
  };
}

export type PopulationProjection = Awaited<
  ReturnType<typeof fetchSchleswigPopulationProjection>
>;
