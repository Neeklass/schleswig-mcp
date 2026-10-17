# Schleswig MCP

A Node.js / TypeScript REST API and Model Context Protocol server for public
information about **Schleswig city, Germany (AGS `01059075`)**. Both transports
call the same domain modules. German source text and official names are preserved;
code, documentation and service messages are in English.

## Implemented features

REST base: `/api/v1/schleswig/`. All REST endpoints use `GET`.
MCP endpoint: `/mcp` (Streamable HTTP).

| REST suffix           | MCP tool                             | Module in `src/modules/`   | Provider in `src/providers/` | Data                          |
| --------------------- | ------------------------------------ | -------------------------- | ---------------------------- | ----------------------------- |
| `water-level`         | `get_schleswig_water_level`          | `water-level.ts`           | `pegelonline.ts`             | Live station, parameter W     |
| `addresses`           | `list_schleswig_addresses`           | `addresses.ts`             | `geodata.ts`                 | 7,619 addresses               |
| `monuments`           | `list_schleswig_monuments`           | `monuments.ts`             | `opendata-sh.ts`             | 251 monuments                 |
| `bathing-waters`      | `list_schleswig_bathing_waters`      | `bathing-waters.ts`        | `govdata.ts`                 | 2 reference locations         |
| `charging-stations`   | `list_schleswig_charging_stations`   | `car-charging-stations.ts` | `bundesnetzagentur.ts`       | 61 installations              |
| `population-forecast` | `list_schleswig_population_forecast` | `population-forecast.ts`   | `govdata.ts`                 | 39 indicators in one document |

Water levels remain live. Measurements older than 15 minutes are returned with
`freshness.isStale: true`. Missing/invalid measurements are errors. **A gauge
reading is not water depth.** These unvalidated measurements are not navigation
depth, flood warnings or safety assessments.

Other features use prepared snapshots. Bathing-water records do not establish
current swimming safety; charging register status is not live availability.
Population combines historical inputs and projections for 2018, 2020, 2030, 2035
and 2040. There is no 2025 value axis in this snapshot.

## Installation and local development

Requires Node.js **24.x** and npm. Internet is needed for installation and live
water levels; no upstream API key is required.

```sh
npm ci
npm run check
npm start
```

- REST example: `http://127.0.0.1:3000/api/v1/schleswig/addresses?q=Abelsteg&limit=5`
- Water level: `http://127.0.0.1:3000/api/v1/schleswig/water-level`
- MCP client URL: `http://127.0.0.1:3000/mcp`
- Development: `npm run dev`; set `PORT` to change port 3000.

The local server binds to `127.0.0.1` and validates local Host/Origin headers.
For deployment, `PUBLIC_ORIGIN` must be an exact HTTPS origin without a path,
query or credentials. Vercel's `VERCEL_URL` is the fallback; configure
`PUBLIC_ORIGIN=https://schleswig-mcp-data-seven.vercel.app` in the **Production**
environment to accept the stable production alias. Leave it unset in **Preview**
so each preview accepts its own `VERCEL_URL` hostname. Applying the production
override to Preview would reject preview requests. Deployment mode accepts the
configured hostname and Origin. Clients without Origin headers work. No cross-origin browser access or
authentication service is implemented.

## REST contract

Water level accepts no query parameters and retains its `station`, `measurement`,
`freshness`, `source` and `notices` response. All five snapshot endpoints accept:

| Parameter | Meaning                                                     |
| --------- | ----------------------------------------------------------- |
| `id`      | Exact record ID, supplied as a string                       |
| `q`       | Case-insensitive substring, 1–200 characters after trimming |
| `limit`   | Integer 1–100; default 20                                   |
| `offset`  | Nonnegative safe integer; default 0                         |

Search fields: addresses use street, house number/addition and postal code;
monuments use name/address; bathing waters use name/keywords; charging stations
use operator, display name and street/house number; population uses indicator
name. `id` and `q` combine with AND. Unknown/repeated parameters are rejected.
Empty results return a successful empty page. Source order is stable within a
snapshot and may change when a replacement snapshot is deployed.

Snapshot responses contain `metadata`, `data`, `pagination` and `notices`.
Pagination has `offset`, `limit`, `total`, `returned` and `nextOffset`; follow
`nextOffset` until null. `metadata.recordCount` describes the complete Gold
`data` array, while `pagination.total` counts matching domain records. Population
therefore has **one Gold document and 39 public indicators**.

Monuments map the original numeric `object_id` to string `id`. Population maps
source arrays to `{year, value}` pairs, preserving nulls. Other record structures
follow the prepared files. Coordinates use EPSG:4326; for bathing waters use
longitude/latitude rather than the retained projected coordinates (see source notes).

Errors use `{ "error": { "code": "...", "message": "..." } }`.

| Status | Meaning                                                             |
| ------ | ------------------------------------------------------------------- |
| 400    | Invalid target or query                                             |
| 403    | Rejected Host or Origin                                             |
| 404    | Unknown route                                                       |
| 405    | Unsupported method; `Allow: GET`                                    |
| 502    | Unavailable/invalid PEGELONLINE response                            |
| 503    | Missing measurement or unavailable/missing/invalid prepared dataset |
| 504    | Upstream timeout                                                    |
| 500    | Unexpected internal failure                                         |

Responses use JSON, `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
Internal paths and parser details are not exposed.

## MCP contract

Tools have English descriptions, input/output schemas and read-only annotations.
Water level takes `{}`; list tools accept `id`, `q`, `limit`, `offset` with REST's
semantics. MCP integers are JSON numbers. Success includes `structuredContent`
and matching JSON text. Tool failures use `isError: true`; transport failures
use protocol-specific responses.

Requests are limited to 64 KiB; list results are bounded to 100 records. Serving
is stateless, without session storage or subscription streams. `/api/mcp` is a
Vercel-compatible alias of the same endpoint.

GET and DELETE on the stateless MCP endpoint return HTTP 405; a standalone SSE
notification stream is not offered. POST discovery and tool execution work with
the SDK's legacy and modern protocol negotiation. See the
[Streamable HTTP transport requirements](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

Tool schemas use JSON Schema 2020-12. Inspector 2.11.0 reported one portability
error per dataset tool at
`outputSchema.properties.metadata.properties.projectedCoordinates.properties.fields.items`.
Zod's closed tuple emitted `items: false`, which is valid JSON Schema but rejected
by some consumers according to [Inspector's portability rules](https://github.com/modelcontextprotocol/inspector/blob/2.11.0/core/json/schemaLint.ts).
An explicit `z.never()` tuple rest now emits the equivalent `items: { "not": {} }`;
the two ordered field names remain mandatory and extra items remain forbidden.

For bathing-water, charging and population tools, `mcp/output-schema.ts` adapts
the SDK's Standard Schema output converter after Zod's final union compaction.
It expands nullable `type` arrays into equivalent `anyOf` branches, removing
Inspector's nine remaining portability warnings. It visits schema positions
only, preserving constraints, references, defaults and examples. The original
Zod validators, inferred types and input converters remain unchanged; required
nullable properties still accept explicit null and reject omission. Domain
models, REST responses and Gold files are unchanged.

Inspector 2.11.0's portability checker reports **zero errors and zero warnings**.
Both type arrays and `anyOf` are valid JSON Schema 2020-12. Clients that translate
schemas into narrower dialects may still need their own adaptation: OpenAPI 3.0,
for example, has no `null` type, so changing the union spelling cannot make it
fully compatible. See [Inspector's rationale](https://github.com/modelcontextprotocol/inspector/pull/2395).

On Windows with Node.js 24.12.0, Inspector 2.11.0's CLI produced the complete
zero-error report but then aborted during shutdown with `UV_HANDLE_CLOSING`.
This occurred both directly and as a child process; it does not establish a
successful CLI exit. The symptom matches the upstream
[Node.js Windows shutdown issue](https://github.com/nodejs/node/issues/56645).
The SDK client tests and the same Inspector lint function finish successfully.
No application workaround or dependency change was made for this tooling crash.

## Architecture

- `api/index.ts`: REST routing, validation, security, errors, serialization and
  Vercel entry point. `api/mcp.ts` only re-exports the MCP entry point for discovery.
- `mcp/`: MCP server, tool registration, protocol schemas, transport and errors.
- `src/modules/`: shared domain functions; `models/` contains public record
  schemas and inferred types. No transport dependencies.
- `src/providers/`: source loading, validation and domain mapping. Providers
  can supply several modules and have same-named `docs/datasources/*.md` files.
- `src/shared/`: metadata, read-only Gold loading, pagination, safe errors,
  deployment settings and bounded original-source I/O.
- `src/app.ts`, `src/index.ts`: minimal local bootstrap and lifecycle.
- `data/curated/`: five prepared JSON files serving the static features.
- `data/imported/`: unchanged optional originals, excluded from Git, formatting,
  linting, build and deployment; never used for production requests.

Existing explicit original readers (`fetchSchleswigHeritage`,
`fetchSchleswigBathingWaters`, `fetchSchleswigPopulationProjection`,
`fetchSchleswigChargingStations`, `loadSchleswigAddresses(path, dataAsOf)`) remain
manual inspection operations. REST/MCP use the separate `get*Dataset` Gold
readers. Neither path writes or prepares data.

## Gold data and metadata

Every file uses `{ "metadata": { ... }, "data": [ ... ] }`. Zod checks metadata
and records, counts, unique IDs, municipality membership, coordinates and
population dimensions. Files load lazily once per process, sharing concurrent
loads. Cached objects are frozen; failed loads can be retried. Restart or
redeploy after replacing a successfully cached file.

| Date field                             | Meaning                                                       |
| -------------------------------------- | ------------------------------------------------------------- |
| `dataAsOf`                             | Supported domain snapshot date, otherwise null                |
| `sourcePublishedAt`, `sourceUpdatedAt` | Source publication/catalog dates, not download times          |
| `retrievedAt`, `curatedAt`             | Evidenced timezone-qualified event timestamps, otherwise null |

All current retrieval/preparation timestamps are null: no reliable event records
exist. `language: "de"` describes source content, not English metadata prose.
`processing.steps` records evidenced changes. See the
[implementation audit](docs/implementation-report.md) for corrections.

All five Gold files are tracked and must accompany builds/deployments. Missing
Gold files are not automatically recreated from originals. The schema-portability
review changed no Gold metadata or records and no original files.

## Tests and build

`npm run check` runs TypeScript, ESLint, Prettier, Vitest, build and a compiled
REST/MCP check from an unrelated working directory. Tests use synthetic source
fixtures and Gold files, never live services or ignored originals. CI runs the
same command in `.github/workflows/ci.yml`.

Regression tests inspect the actual advertised schemas, execute all six tools
with a validating MCP client, compare REST/MCP results, traverse complete lists,
check search and pagination boundaries, and verify deployment routing/security.
The largest 100 records of each snapshot also bound the serialized response,
including MCP's text and structured representations, below a conservative 1 MB
test budget. This leaves headroom below Vercel's
[4.5 MB response limit](https://vercel.com/docs/functions/limitations).

`npm run build` cleans only generated `dist/`, compiles `api/`, `mcp/`, `src/`,
and copies Gold to `dist/data/curated/`. Start with `node dist/src/index.js` or
`npm start`. Module-relative paths are independent of the working directory.
`npm run check:build` checks compiled execution. With the built server running,
`npm run smoke` separately checks live PEGELONLINE through REST and MCP.

## Vercel deployment

Production uses the existing default domain
**https://schleswig-mcp-data-seven.vercel.app**. The remote MCP URL is
**https://schleswig-mcp-data-seven.vercel.app/mcp**; no custom domain is needed.
Read-only integration checks verified all six REST endpoints and MCP tools,
same-origin acceptance, foreign-Origin rejection and private-file 404 responses.
These checks inspected the existing deployment; local fixes were not deployed.

`vercel.json` prepares two Node.js Functions, explicit REST/MCP routes and Gold
JSON inclusion in both bundles. Other paths return 404. `.vercelignore` excludes
originals, exploration tools, tests and scratch data. Vercel uses deployment-root
Gold paths to account for relocated bundles. Select Node.js 24 and configure
`PUBLIC_ORIGIN`; do not use `dist/` as a static hosting output directory.

Keep the Framework Preset **Other**. `outputDirectory` is explicitly `public`,
which contains only a small English identification page (`public/index.html`).
This supplies the non-empty static output directory Vercel requires; application
source, `dist/` and original datasets are not static assets. Existing routes are
unchanged, so the final 404 rule still applies to `/` and `/index.html`.

After the next owner-authorized deployment, rerun Inspector's strict tools/list
check and verify the fix on the remote endpoint. Preview environment-variable
scope, generated bundles, cold starts, function logs and platform protections
still require dashboard/preview verification. Local tests do not verify a new
deployment. Both functions retain a 15-second limit; the only request-time
external source, PEGELONLINE, has a five-second timeout. Platform rate/usage
protections remain deployment decisions. No database is needed. Configuration
follows Vercel's
[Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js),
[versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) and
[function settings](https://vercel.com/docs/project-configuration/vercel-json#functions).

## Optional data exploration notebook

`data/exploration.ipynb` remains a local read-only EDA tool. Owner settings and
outputs are independent of the application. Review `SOURCE`, `FORMAT` and
`JSON_PATH` before running; for example use
`data/curated/opendata-sh/monuments.json` with `JSON_PATH = ("data",)`.

```powershell
python -m venv .scratchpad/eda-venv
.\.scratchpad\eda-venv\Scripts\python.exe -m pip install -r data/requirements.txt
```

On Linux/macOS use `.scratchpad/eda-venv/bin/python`. Select that kernel. Supported
previews: CSV, TXT, JSON/JSO and Parquet. There are no downloads or exports.
Python is not an application/build dependency. `tests/test_exploration.py` is an
optional synthetic check of a notebook copy, independent of saved selections.

The retained `data/scripts/filter_*.py` scripts operate on older, explicitly
supplied intermediate files with hardcoded filenames. They do not regenerate
current Gold JSON, and are not run by application tests, builds or requests.
No automatic preparation pipeline or separate street dataset/API is implemented.

## Sources and licenses

- [PEGELONLINE / WSV](docs/datasources/pegelonline.md): DL-DE-Zero-2.0.
- [LVermGeo SH addresses](docs/datasources/geodata.md): CC BY 4.0.
- [Open Data SH monuments](docs/datasources/opendata-sh.md): CC BY 4.0.
- [GovData-discovered datasets](docs/datasources/govdata.md): CC BY 4.0 for
  bathing-water CSV, CC0 1.0 for population.
- [Bundesnetzagentur](docs/datasources/bundesnetzagentur.md): CC BY 4.0.

Catalogs and publishers are distinguished. Responses retain credits, source and
license links, and processing information. Source documents explain reacquisition
under new filenames; mutable URLs may not reproduce old snapshots. Source-code
licensing is undecided and separate from data/dependency licenses.
