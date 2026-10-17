# Schleswig MCP

**Current MVP:** a local HTTP API and MCP server for the latest Schleswig
water-level measurement from PEGELONLINE. One station, one parameter.

Requires Node.js 24, npm, and internet access. No API key needed.

```sh
npm ci
npm run build
npm start
```

- HTTP: `GET http://127.0.0.1:3000/api/v1/schleswig/water-level`
- MCP (Streamable HTTP): `http://127.0.0.1:3000/mcp`
- Tool: `get_schleswig_water_level` (no arguments)

Responses include the station, timestamp, source, and freshness. Readings older
than 15 minutes are flagged as stale. **Gauge readings are not water depth; the
source measurements are unvalidated.**

Local use only. Each request fetches upstream data; no history or caching.
Set `PORT` to change the default port (3000).

Development: `npm run dev`. Checks: `npm run check` (no live upstream calls).
Live verification with the server running: `npm run smoke`.
The code separates transport adapters, domain logic, and data providers:

- `src/index.ts`: application entry point.
- `src/shared/http.ts` and `src/mcp/mcp.ts`: HTTP and MCP adapters calling the
  same domain module.
- `src/shared/`: shared technical helpers, including errors and bounded dataset
  I/O. These helpers are not data providers.
- `src/modules/`: domain functions and models for public features, including
  water-level freshness rules. The existing comment-only files record intended
  provider assignments; they contain no implemented or exposed functionality.
- `src/providers/`: integrations grouped by external provider or source catalog,
  including fetching or explicit file loading, validation, and mapping to typed
  records. One provider can supply several modules and datasets.
- `docs/datasources/<name>.md`: the documentation for
  `src/providers/<name>.ts`, in a **1:1 filename correspondence**. A document can
  cover multiple datasets and distinguishes their publishers from catalogs.
- `data/imported/`: optional, Git-ignored original downloads, grouped by source.
  They remain unchanged and are not intended for direct production API use.
- `data/curated/`: intended location for manually prepared, reduced datasets.
  No curated-data reader or conversion pipeline is currently implemented.

Dataset formats stay inside providers; modules and adapters do not parse upstream
responses or source files. Imported files retain their original contents and are
excluded from Git, Prettier, ESLint, and TypeScript builds. Tests use small
synthetic fixtures and do not require downloaded originals. CI is configured in
`.github/workflows/ci.yml` at the repository root.

## Available integrations

Only `src/modules/water-level.ts` is publicly exposed. Adding a provider does not
add an HTTP endpoint or MCP tool.

| Provider               | Entry points                                                            | Access                             | Module assignment                                            |
| ---------------------- | ----------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------ |
| `pegelonline.ts`       | `fetchSchleswigMeasurement()`                                           | Live REST API                      | `water-level.ts`: active over REST and MCP                   |
| `opendata-sh.ts`       | `fetchSchleswigHeritage()`                                              | Pinned JSON release                | `monuments.ts`: comment only                                 |
| `govdata.ts`           | `fetchSchleswigBathingWaters()`, `fetchSchleswigPopulationProjection()` | Publishers' CSV and JSON endpoints | `bathing-waters.ts`, `population-forecast.ts`: comments only |
| `bundesnetzagentur.ts` | `fetchSchleswigChargingStations()`                                      | Pinned CSV release, streamed       | `car-charging-stations.ts`: comment only                     |
| `geodata.ts`           | `loadSchleswigAddresses(path, dataAsOf)`                                | Explicit local file, streamed      | `addresses.ts`: comment only                                 |

Each provider has the same-named document under `docs/datasources/`. `govdata.ts`
groups the existing integrations discovered through GovData; it calls the actual
publishers directly and does not query the catalog at runtime. The `geodata-sh`
comment in `addresses.ts` identifies LVermGeo SH and its unchanged raw-data folder;
the corresponding provider and document are named `geodata.ts` and `geodata.md`.

Dataset provider results contain normalized records (or population indicator series),
retrieval time, source, license, attribution, and a description of transformations.
They retain missing values and coordinate units. Their `dataAsOf` is `null` when
the download does not provide a reliable dataset date; retrieval time is not a
measurement date. `DatasetError` distinguishes unavailable sources, timeouts,
invalid source data, and missing Schleswig records. These errors are not yet
mapped to public endpoints because the providers are not publicly exposed.

Remote dataset downloads have time and size limits. The register and address
readers process rows incrementally and retain only Schleswig records. They are
explicit read operations: they do not write downloads or curated datasets and
must not be called for every API request. Future modules may use manually prepared
data from `data/curated/` through their providers. No database, background scheduler,
or persistent cache is required by the current API.

For example, an explicit provider check (network access required) is:

```sh
node --input-type=module -e "import { fetchSchleswigHeritage } from './src/providers/opendata-sh.ts'; console.log((await fetchSchleswigHeritage()).records.length)"
```

## Optional original datasets

A fresh clone needs only `npm ci` and `npm run check`; raw downloads are optional.
For each dataset, follow the **Reacquisition** section in its source document.
Those sections identify exact release URLs where available and explain when a
mutable URL cannot recreate a historical snapshot. Download into a new filename
under `data/imported/<source>/`; never overwrite an existing original implicitly.
Keep the provider's accompanying notes, dataset date, and a SHA-256 checksum with
an archive if exact historical reproduction is needed.

The LVermGeo loader requires an explicit extracted UTF-8 file and the extraction
date from its accompanying notes. It never guesses a repository file or downloads
an archive automatically. This retained offline reader is not a production API
integration or an automatic preparation pipeline. The download portal was reachable on 2026-10-17 using
the system certificate store, but Node's default trust configuration reported an
incomplete certificate chain. TLS verification must not be disabled.

Check exclusion with `git check-ignore -v data/imported/<source>/<file>`.
`git ls-files -- data/imported` must return no files.

## Planned manual data preparation

The project owner will manually reduce original downloads to the information
actually needed and place the results in `data/curated/`. Use a suitable compact
format, potentially Parquet; no format, conversion, dependency, or reader is being
introduced now. Originals in `data/imported/` remain unchanged. Future providers
may read curated datasets when a concrete module requires them, preserving source,
license, date, and transformation information. Whether curated files will be
versioned in Git remains undecided. Tests and builds currently require neither
imported nor curated files.

## HTTP errors

REST errors use `{ "error": { "code": "...", "message": "..." } }`.
Invalid request targets return 400; rejected Host/Origin headers return 403;
unknown routes return 404; unsupported methods return 405. Source failures return
502, source timeouts 504, unavailable measurements 503, and unexpected failures 500. The MCP endpoint retains its protocol-specific JSON-RPC errors; tool
execution failures use `isError: true`. Internal exception details are not exposed.

Source documentation:
[PEGELONLINE REST API](docs/datasources/pegelonline.md),
[charging stations](docs/datasources/bundesnetzagentur.md),
[address coordinates](docs/datasources/geodata.md),
[bathing waters and population projections](docs/datasources/govdata.md), and
[heritage register](docs/datasources/opendata-sh.md).

Data licenses differ by dataset; see the linked source documentation.
Source-code license: not yet selected.
