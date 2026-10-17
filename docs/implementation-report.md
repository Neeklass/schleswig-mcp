# Architecture and Gold-data audit

Completed on **2026-10-17**. The working tree was inspected before implementation,
including manual edits, all five Gold JSON files, existing original readers,
original-source evidence, notebook/filter utilities, tests and build/CI settings.
No commits, pushes, publication, dependency upgrades or source-code license
selection were performed.

## 1. Gold files checked

All files now use exactly `{metadata, data}` at the root. Their complete contents
are validated; validation is not limited to the presence of those two keys.

| File                                                    | Gold records |                          Public records | Final bytes |
| ------------------------------------------------------- | -----------: | --------------------------------------: | ----------: |
| `data/curated/geodata-sh/addresses.json`                |        7,619 |                         7,619 addresses |   2,022,937 |
| `data/curated/opendata-sh/monuments.json`               |          251 |                           251 monuments |     153,789 |
| `data/curated/govdata/bathing_waters.json`              |            2 |                        2 bathing waters |       4,788 |
| `data/curated/govdata/population_forecast.json`         |            1 | 39 indicators, 195 year/value positions |      61,222 |
| `data/curated/bundesnetzagentur/charging-stations.json` |           61 |                        61 installations |      84,730 |

All select **Schleswig city, AGS `01059075`**, not the district or state. Record
IDs are unique within each dataset; population indicator IDs are unique within
the selected document. Tests verify metadata, schemas, counts, required fields,
null handling, identifiers, dates, coordinate bounds and nested relationships.

The manual comparison checked retained source fields and selection against the
existing originals. All 195 population values and definitions match their source.
All 7,619 address coordinates passed an independent inverse transformation,
maximum numerical difference `2.7939677238464355e-9` metres. This is a numerical
consistency check, not a statement of geographic survey accuracy.

## 2. Metadata findings and corrections

| Dataset           | Corrections                                                                                                                                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Addresses         | Replaced ambiguous `sourceDate`; added explicit nullable dates, catalog/download/format fields; normalized `processing` array to `processing.steps`. Preserved existing attribution and transformation evidence.                       |
| Monuments         | Distinguished actual publisher/provider from Open Data SH catalog; added pinned download/format and evidenced processing; separated release/publication/update dates; removed unsupported preparation date.                            |
| Bathing waters    | Replaced copied monument ID/title/description, source provider/publisher/URLs and attribution. Correct credit is `Sozialministerium S-H`. Added processing and coordinate metadata; catalog date is not a proven domain snapshot date. |
| Population        | Replaced copied monument metadata, including erroneous date and CC BY license. Correct license is CC0 1.0; `recordCount` is 1, not 251. Added actual publisher/provider, API URL, credits, processing and temporal coverage.           |
| Charging stations | Moved root `recordCount` into metadata; added original download/format and processing; identified register snapshot/update date; removed unproven preparation timestamp.                                                               |

Dates are now consistent ISO dates or explicit nullable event timestamps:

| Dataset           | `dataAsOf`                                   | `sourcePublishedAt`  | `sourceUpdatedAt`         |
| ----------------- | -------------------------------------------- | -------------------- | ------------------------- |
| Addresses         | 2026-06-01 (documented extraction)           | null                 | null                      |
| Monuments         | 2026-10-12 (release/temporal-start metadata) | 2026-10-12           | 2026-10-12                |
| Bathing waters    | null                                         | 2026-04-01 (catalog) | 2026-04-01 (catalog)      |
| Population        | null                                         | 2025-03-21 (catalog) | 2025-06-04 (catalog)      |
| Charging stations | 2026-09-01 (register snapshot)               | null                 | 2026-09-01 (CSV preamble) |

All `retrievedAt` and `curatedAt` values are null. Existing timestamps were not
accepted as proof of themselves, and filesystem dates were not substituted.
`language: "de"` describes original dataset content; metadata prose is English.

Official metadata/terms were consulted for each static source. Population's
[official metadata](https://opendata.schleswig-holstein.de/api/3/action/package_show?id=bevolkerungsvorausberechnung-fur-schleswig-holstein-bis-2040)
declares CC0, while the bathing CSV's
[distribution metadata](https://www.govdata.de/ckan/api/3/action/package_show?id=badegewasser-stammdaten)
declares CC BY 4.0 and its specific credit. Other verified source and license
links are recorded in the five datasource documents.

Two content corrections were supported by exact original text, both in
`data/curated/opendata-sh/monuments.json`:

- Object 10545, `description`: `Kirchenmunicipality` → `Kirchengemeinde`.
- Object 9381, `name`: `municipalityhaus` → `Gemeindehaus`.

These were unintended substitutions of field-name translation into German data.
SHA-256 comparison of parsed data arrays confirmed **no other content changes**.
Formatting and metadata changes do not count as record-content changes. All
seven files under `data/imported/` remained byte-identical, confirmed by hashes;
none is tracked in Git. No new data product or full preparation was performed.

## 3. TypeScript and transport architecture

- `api/index.ts` contains REST routing, HTTP validation/security, status mapping,
  errors and JSON serialization. The old `src/shared/http.ts` was removed.
- `mcp/mcp.ts` registers six tools, with schemas, English descriptions and safe
  structured results. `mcp/index.ts` owns MCP HTTP transport, protocol errors,
  request limits and pre-parsed body support. The old `src/mcp/mcp.ts` was removed.
- `api/mcp.ts` is only the Vercel-discovery re-export. `src/app.ts` and
  `src/index.ts` provide minimal local bootstrap/lifecycle.
- Existing domain module placeholders now implement their intended dataset
  functions. Public record schemas/types live in `src/modules/models/`.
- Existing providers gained Gold schemas and cached `get*Dataset` readers. The
  provider assignments and explicit original readers were preserved. Public
  requests do not call those original readers or parse raw CSV files.
- `src/shared/gold-metadata.ts` validates shared metadata, dataset identity,
  license consistency, counts and uniqueness. `src/shared/gold-reader.ts` resolves
  source/build/deployment paths, distinguishes missing/unavailable/invalid files,
  shares concurrent loads, freezes cached results and retries failed loads.
- `src/shared/pagination.ts` supplies common filters, pagination and result
  envelopes. List defaults are 20 records, maximum 100. ID/substring filters are
  identical over REST and MCP. Population is mapped to indicators without
  rewriting the prepared document.
- `src/shared/errors.ts` no longer maps HTTP statuses. REST owns status mapping;
  MCP owns protocol/tool errors. Internal paths and parser details stay private.
- `tsconfig.json`, `tsconfig.build.json`, `eslint.config.js`, `package.json`,
  `scripts/build.mjs`, `scripts/check-build.mjs`, `scripts/smoke.mjs` cover the
  new layout. Build cleans its guarded output directory and copies Gold only.

## 4. Provider, module, REST and MCP mapping

REST routes below are relative to `/api/v1/schleswig/`.

| Provider file under `src/providers/` | Module under `src/modules/` | REST route            | MCP tool                             |
| ------------------------------------ | --------------------------- | --------------------- | ------------------------------------ |
| `pegelonline.ts`                     | `water-level.ts`            | `water-level`         | `get_schleswig_water_level`          |
| `geodata.ts`                         | `addresses.ts`              | `addresses`           | `list_schleswig_addresses`           |
| `opendata-sh.ts`                     | `monuments.ts`              | `monuments`           | `list_schleswig_monuments`           |
| `govdata.ts`                         | `bathing-waters.ts`         | `bathing-waters`      | `list_schleswig_bathing_waters`      |
| `govdata.ts`                         | `population-forecast.ts`    | `population-forecast` | `list_schleswig_population_forecast` |
| `bundesnetzagentur.ts`               | `car-charging-stations.ts`  | `charging-stations`   | `list_schleswig_charging_stations`   |

All six features are implemented. No separate street function or additional
dataset was invented. PEGELONLINE remains live and retains its existing response
contract and freshness policy.

## 5. Documentation updated

- `README.md`: actual features, architecture, contracts, filters/pages, metadata,
  local setup, tests/build, Vercel preparation, source licenses and optional tools.
- `AGENTS.md`: binding new directory responsibilities, shared domains/providers,
  source-document correspondence, Gold/raw handling and English-language rules.
- `docs/datasources/pegelonline.md`
- `docs/datasources/geodata.md`
- `docs/datasources/opendata-sh.md`
- `docs/datasources/govdata.md`
- `docs/datasources/bundesnetzagentur.md`
- `docs/implementation-report.md`: this audit and completion report.

Datasource documents identify publisher/catalog, downloads, original formats and
paths, Gold counts, scope, dates, processing, licenses/credits, consumers, updates
and limitations. Ignored originals are code paths with official download links,
not relative links to absent GitHub files. Existing manual preparation evidence
and optional notebook/filter utilities were retained and described accurately.

## 6. Verification results

`npm run check` passes:

- TypeScript typecheck: passed.
- ESLint: passed.
- Prettier: passed.
- Vitest: **146 tests in 7 files passed**, without live APIs or raw files.
- Build: passed; output includes `dist/api/`, `dist/mcp/`, `dist/src/` and
  `dist/data/curated/`.
- Compiled runtime check: passed for all five static REST endpoints and MCP tools
  from an unrelated working directory, comparing structured responses.

New tests are in `tests/gold.test.ts` and `tests/deployment.test.ts`; protocol
coverage was expanded in `tests/http-mcp.test.ts`. Existing water-level and
original-reader tests remain. Tests cover invalid metadata/records, dimensions,
duplicates, nulls, cache immutability, failed-load retry, missing/malformed files,
pagination/filtering, protocol equality, query/prototype keys, oversized MCP
bodies, Host/Origin rules and Vercel-style pre-parsed requests.

Optional `tests/test_exploration.py` passed synthetic CSV/TXT/JSON/Parquet checks
and two real-kernel notebook-copy executions. The test now overrides saved source
selection/format and supports the current JSON inspection mode. The owner's
notebook itself, including settings and outputs, was not changed.

Separate live integration: the built REST and MCP paths both returned **539 cm**,
timestamp **2026-10-17T22:39:00+02:00**, from the Schleswig station. At check time
`2026-10-17T20:45:07.652Z`, the MCP result was 367 seconds old and not stale.
This was a one-time smoke check, not an automated test dependency.

`git diff --check` passed. Original-file hashes and Gold-content preservation
checks passed. A sandbox initially prevented Vitest worker creation; rerunning
with the approved test permission succeeded. This was not an application failure.

## 7. Vercel readiness and limitations

`vercel.json` defines the two Function entry points, Gold `includeFiles`, REST/MCP
routes and a final 404. `.vercelignore` excludes originals and local analysis
artifacts. Runtime paths handle Vercel's deployment root. Node.js 24 is required;
`PUBLIC_ORIGIN` selects the canonical HTTPS origin, with `VERCEL_URL` fallback.
MCP supports pre-parsed bodies and rejects bodies over 64 KiB; subscription
streams are disabled. Both transports validate Host/Origin.

No actual Vercel project was linked, built through Vercel CLI or deployed. Local
checks cannot certify platform bundling/rewrites, custom-domain settings,
timeouts, protection settings or rate limits. These require an authorized preview
deployment. Do not configure `dist/` as a public static asset directory.

## 8. Open limitations and owner decisions

- Gold files are required for static features and remain uncommitted. Decide
  their Git inclusion or another explicit deployment delivery method before
  a Git-based deployment. No raw files should be committed.
- Choose the eventual domain and configure `PUBLIC_ORIGIN`, platform usage
  protection and deployment access settings. Publication still needs permission.
- Source-code licensing remains undecided and separate from source-data licenses.
- Bathing-water projected CRS metadata conflicts with unprefixed eastings. This
  is documented, not guessed or repaired; use the supplied EPSG:4326 coordinates.
- Actual historical retrieval/preparation timestamps remain unknown. Supply
  evidence before filling them; source dates and filenames do not suffice.
- Static snapshots require manual replacement and restart/redeployment. No refresh
  scheduler, database, automatic preparation or separate street API was added.
- Registers and projections retain the source limitations documented above;
  snapshots do not establish current bathing safety or charging availability.

No failing application check or unresolved implementation blocker remains.
