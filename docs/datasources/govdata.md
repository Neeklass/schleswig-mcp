# Datasets discovered through GovData

Provider: [`src/providers/govdata.ts`](../../src/providers/govdata.ts).
**GovData is a discovery catalog, not either dataset's publisher.** One provider
supplies two modules. Both use prepared Gold snapshots; no catalog or publisher is
queried on a static API request. Original readers remain explicit inspection
operations, separate from production Gold access and manual preparation.

## Bathing-water reference data

Original provider/publisher: **Ministerium für Justiz und Gesundheit
Schleswig-Holstein**, as identified in source metadata. Required credit remains
**Sozialministerium S-H**; do not replace it with the catalog name.

- [Catalog record](https://www.govdata.de/suche/daten/badegewasser-stammdaten).
- [Official distribution metadata](https://www.govdata.de/ckan/api/3/action/package_show?id=badegewasser-stammdaten).
- [Publisher CSV download](https://efi2.schleswig-holstein.de/bg/opendata/v_badegewaesser_odata.csv).
- Optional original: `data/imported/govdata/2026-04-01_Badegewaesser.csv`.
- Original format: headerless, 29-column, pipe-separated ISO-8859-1 CSV; quoted
  fields and some literal quotes in unquoted fields. There are 329 source records.
- Gold: [`data/curated/govdata/bathing_waters.json`](../../data/curated/govdata/bathing_waters.json),
  **2 records**, unique IDs `DESH_PR_0349` and `DESH_PR_0266`.

Scope: Schleswig city, district code `59`, municipality code `075`, AGS `01059075`.
Locations are Auf der Freiheit and Luisenbad. Status: **integrated** through
`getBathingWaterDataset()`, `src/modules/bathing-waters.ts`, REST
`/api/v1/schleswig/bathing-waters`, MCP `list_schleswig_bathing_waters`.

The catalog publication/update date is **2026-04-01**. The local filename uses
that date, but the mutable CSV has no reliable embedded data snapshot date:
`dataAsOf` is null. Download/preparation timestamps are also unknown/null.
Catalog harvesting dates are not data dates. The source registration dates are
record-level facts and remain separate.

Evidenced manual preparation selected Schleswig, selected/renamed attributes,
converted numeric/date strings, split keywords, converted empty optional values
to null, and removed trailing `<br><br>` from the Luisenbad description. Coordinate
numbers were retained without transformation. The
[2026-10-17 audit](../implementation-report.md#historical-architecture-and-data-audit-2026-10-17)
compared retained fields to the original; the data array was unchanged. Incorrect monument ID,
title, description, provider, publisher, URL and attribution were replaced.

Longitude/latitude use **EPSG:4326**. The source metadata calls its projected fields
EPSG:4647, but retained eastings (about 536,000–538,000) have no zone prefix. This
inconsistency is recorded in `metadata.projectedCoordinates`; values were not
silently altered or relabeled. Use longitude/latitude for spatial operations.

The publisher's
[field descriptions](https://opendata.schleswig-holstein.de/dataset/8049b860-6d5c-4ad8-a584-43bec41a6220/resource/13269a62-71af-499e-b4b2-e28882c4d6c1/download/badegewasser-stammdaten-aktuell.json):
`UTM_OST` and `UTM_NORD` declare EPSG:4647, while longitude and latitude
declare EPSG:4326. `sourceDeclaredCrs` records that declaration, not a verified
CRS assignment to the retained numbers. **Manual review remains required:** no
authoritative correction is recorded. Preserve the original values until one
is available; do not infer a replacement CRS from the eastings alone.

The CSV distribution specifically declares
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) and **Sozialministerium S-H**,
rechecked on 2026-10-18. Preserve that credit, source/license links and processing
notices. The catalog's separate JSON/Frictionless distribution has different
license metadata and must not be substituted indiscriminately.

Updates are irregular. Download a new CSV to a new original path, retain encoding,
manually prepare/review Gold, run `npm run check`, restart/redeploy. The mutable
URL cannot guarantee reproduction of the old snapshot. The existing
`fetchSchleswigBathingWaters()` reads the original CSV explicitly (4 MiB/30 seconds);
the old `data/scripts/filter_bathing_waters.py` operates on an intermediate CSV.
Neither is a production preparation pipeline.

These are reference locations and descriptions, not current measurements,
classifications, season/opening status or a swimming safety assessment.

## Population projection through 2040

Publisher: **Bertelsmann Stiftung**, via the original provider **Wegweiser Kommune**.
Credits also name the statistical offices, their research data centers and
Deenst GmbH. GovData/Open Data SH provide discovery metadata.

- [Publisher dataset page](https://www.wegweiser-kommune.de/vorausberechnung-2019-2040-schleswig-holstein).
- [GovData discovery](https://www.govdata.de/suche/daten/bevolkerungsvorausberechnung-fur-schleswig-holstein-bis-2040).
- [Official metadata and license](https://opendata.schleswig-holstein.de/api/3/action/package_show?id=bevolkerungsvorausberechnung-fur-schleswig-holstein-bis-2040).
- [Publisher JSON API](https://www.wegweiser-kommune.de/data-api/rest/statistics/data/demografie-bevoelkerungsstand+demografische-prognose-bewegung+bevoelkerung-nach-altersgruppen-1+anteile-der-altersgruppen-1-1+entwicklung-der-altersgruppen-1+generationsentwicklung+gemeinden-und-staedte-und-landkreise-aus-schleswig-holstein+schleswig-holstein+2018-2040+tabelle).
- Optional original: `data/imported/govdata/2025-06-04_Bevoelkerungsvorausrechnung_bis_2040.JSO`.
- Format: JSON despite `.JSO`, with region, indicator and year arrays.
  Original: 114 regions, 39 indicators, years 2018/2020/2030/2035/2040.
- Gold: [`data/curated/govdata/population_forecast.json`](../../data/curated/govdata/population_forecast.json),
  **one document**, one municipality, 39 indicators and 195 value positions.

Scope: region Schleswig, AGS `01059075`, not the district or state. Status:
**integrated** through `getPopulationDataset()`, `src/modules/population-forecast.ts`,
REST `/api/v1/schleswig/population-forecast`, MCP
`list_schleswig_population_forecast`.

Official metadata identifies publication **2025-03-21** and modification
**2025-06-04**. Neither is a measurement date for every value. `dataAsOf` is null,
actual retrieval/preparation timestamps are null, and `temporalCoverage.years`
records the actual value axis. Forecast definitions can have narrower year lists
than the combined value table; the provider preserves the table's full year axis.

Manual preparation selected Schleswig and its corresponding value arrays,
retained definitions/years/credits/nulls, updated selected-region metadata and
indicator minima/maxima, and wrapped the prepared document in the Gold envelope.
The 2026-10-17 audit compared all 195 values and all indicator definitions with the original.
The data array was not changed or flattened. The provider maps it into independent
domain indicator records with explicit year/value pairs and definition text.

Copied monument metadata was corrected: identifier, title, description, dates,
provider/publisher, URLs, license, attribution and `recordCount` (251 → **1**).
Pagination counts **indicators**, while metadata counts Gold documents. These
records contain no spatial coordinates or coordinate reference system.

The official metadata declares
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/), rechecked
on 2026-10-18. CC BY 4.0 was incorrect for this dataset. CC0 does not require
attribution; publisher and original credits are retained for provenance.

Updates are irregular. Save a new publisher JSON response under a new original
filename, manually prepare/review Gold, update documented provenance, run
`npm run check`, restart/redeploy. The API URL represents a selection, not an
immutable release. `fetchSchleswigPopulationProjection()` remains a bounded
explicit reader (16 MiB/30 seconds). The historical
`data/scripts/filter_population_forecast.py` targets an intermediate JSO file.

The projection covers municipalities with at least 5,000 residents and also has
district/state aggregates upstream. Values mix historical inputs and future
assumptions; do not treat all indicators as observed population counts. Preserve
units, definition text and nulls. No interpolation or 2025 values are invented.

Both dataset licenses are separate from the undecided source-code license.
