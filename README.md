# Schleswig MCP

Schleswig MCP brings public data about **Schleswig city, Germany (AGS `01059075`)**
into one consistent interface. Applications can query a REST API, and AI clients
can discover and call the same functions through the **Model Context Protocol
(MCP)**, without separately parsing each publisher's files.

This is an independent open-data project, not operated or endorsed by the City
of Schleswig. German source text and official names are preserved.

**[Website](https://schleswig-mcp-data-seven.vercel.app)** ·
**[REST reference](https://schleswig-mcp-data-seven.vercel.app/docs)** ·
**[MCP documentation](https://schleswig-mcp-data-seven.vercel.app/mcp-docs)**

## Available datasets

All REST routes below are relative to `/api/v1/schleswig/` and use `GET`.

| Dataset             | REST route            | MCP tool                             | Coverage                             |
| ------------------- | --------------------- | ------------------------------------ | ------------------------------------ |
| Water level         | `water-level`         | `get_schleswig_water_level`          | Latest available PEGELONLINE reading |
| Addresses           | `addresses`           | `list_schleswig_addresses`           | 7,619 addresses                      |
| Cultural monuments  | `monuments`           | `list_schleswig_monuments`           | 251 register entries                 |
| Bathing waters      | `bathing-waters`      | `list_schleswig_bathing_waters`      | 2 reference locations                |
| Charging stations   | `charging-stations`   | `list_schleswig_charging_stations`   | 61 installations                     |
| Population forecast | `population-forecast` | `list_schleswig_population_forecast` | 39 indicators in one source document |

Only water level is fetched live. The other five datasets are manually prepared
snapshots, with source dates, licenses and processing notes in their metadata.

## REST API

Base URL: `https://schleswig-mcp-data-seven.vercel.app/api/v1/schleswig/`.
No API key or login is required. Responses are JSON.

```sh
curl "https://schleswig-mcp-data-seven.vercel.app/api/v1/schleswig/addresses?q=Abelsteg&limit=5"
curl "https://schleswig-mcp-data-seven.vercel.app/api/v1/schleswig/water-level"
```

On Windows PowerShell, use `curl.exe` to avoid its `curl` alias.

Water level takes no query parameters. All five snapshot endpoints accept:

| Parameter | Meaning                                                            |
| --------- | ------------------------------------------------------------------ |
| `id`      | Exact, case-sensitive ID; 1–100 characters after trimming          |
| `q`       | Case-insensitive substring search; 1–200 characters after trimming |
| `limit`   | Integer 1–100; default 20                                          |
| `offset`  | Integer 0–9007199254740991; default 0                              |

`id` and `q` combine with AND. Unknown or repeated parameters are rejected.
List responses contain `metadata`, `data`, `pagination` and `notices`. Follow
`pagination.nextOffset` until null, keeping filters and page size unchanged.
An unmatched filter returns a successful empty page. Population pagination
counts indicators; `metadata.recordCount` counts its single source document.

See the [REST reference](https://schleswig-mcp-data-seven.vercel.app/docs) for
search fields, schemas, examples and errors. Host/Origin checks apply; arbitrary
cross-origin browser requests are unsupported. Server-side clients can connect
without an Origin header.

## MCP server and client connection

**Endpoint: `https://schleswig-mcp-data-seven.vercel.app/mcp`**

In an AI client that supports remote MCP servers, add this URL using
**Streamable HTTP**, with no authentication. Connect, discover the six read-only
tools, then try `list_schleswig_addresses` with `{"limit": 1}`. Client settings
vary; the [MCP documentation](https://schleswig-mcp-data-seven.vercel.app/mcp-docs)
includes VS Code configuration and MCP Inspector instructions.

MCP returns the same domain data as REST, wrapped in `structuredContent` and a
matching JSON text entry. List tools use the parameters above, with JSON numbers
for `limit` and `offset`; water level takes `{}`. The service is stateless, with
a 64 KiB request limit and no standalone SSE notification stream. Opening `/mcp`
in a browser returns HTTP 405; use an MCP client to test the connection.

## Quick start

Requires **Node.js 24.x** and npm. From the repository root:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:3000/`. REST, `/docs`, `/mcp-docs` and `/mcp` use the same
local origin. The server binds to `127.0.0.1`; set `PORT` to change port 3000.
Leave `PUBLIC_ORIGIN` and `VERCEL_URL` unset for ordinary local development.

For a compiled run:

```sh
npm run check
npm start
```

The five tracked JSON files under `data/curated/` are required. No original
downloads or Python environment are needed. Internet access is needed for npm
installation, live water levels and Scalar's CDN module.

## API and MCP documentation

| Route           | Content                           | Source                                           |
| --------------- | --------------------------------- | ------------------------------------------------ |
| `/`             | Project homepage                  | `public/index.html`                              |
| `/docs`         | Scalar REST reference             | `public/docs.html`, `public/docs.js`             |
| `/openapi.json` | OpenAPI 3.1 specification         | `api/_lib/openapi.ts`                            |
| `/mcp-docs`     | MCP connection and tool reference | `mcp/documentation.html`, `mcp/documentation.ts` |

Run `npm run docs:generate` after editing documentation sources or schemas.
It also runs before development/tests and during builds. Generated
`public/openapi.json` and `public/mcp-docs.html` are ignored by Git; do not edit
them directly. Regenerate after changes while the development server is running.

The responsive website uses text-only branding, local REST/MCP/GitHub SVG icons,
and System, Light and Dark appearance modes. See the
[maintenance notes](docs/implementation-report.md#website-and-generated-documentation)
for Scalar initialization, theme behavior and asset handling, and
[icon sources](docs/header-icons.md) for credits.

## Data sources and limitations

Curated snapshots are called **Gold** in the code and source documents. Providers
load and validate them; REST and MCP share the same domain functions. Successful
loads are cached read-only. Replace snapshots manually and restart or redeploy;
there is no automatic refresh or preparation pipeline.

- **Water level:** readings older than 15 minutes remain available with
  `freshness.isStale: true`. Missing, invalid and unavailable readings produce
  distinct errors. A gauge reading is not water depth, a flood warning or a
  safety assessment.
- **Reference registers:** bathing-water records do not establish current
  swimming safety; charging records do not show live connector availability.
  Monument and charging registers are not exhaustive.
- **Population:** historical inputs and projections use 2018, 2020, 2030, 2035
  and 2040. Units vary by indicator, and null does not mean zero.
- **Provenance:** unknown download/preparation times remain null. Source dates
  are not retrieval dates. Bathing-water projected coordinates have an unresolved
  CRS inconsistency; use the supplied EPSG:4326 longitude/latitude.

Each [provider document](#attribution-and-licensing) records publisher/catalog,
official links, scope, format, dates, preparation, license and update procedures.

## Architecture

The application uses strict TypeScript, native ES modules and fetch, Zod, the
official MCP TypeScript SDK and Vitest. Dependency versions are pinned in
`package.json` and `package-lock.json`.

| Location                     | Responsibility                                                         |
| ---------------------------- | ---------------------------------------------------------------------- |
| `api/`                       | REST routing, HTTP validation/security, errors and OpenAPI generation  |
| `mcp/`                       | MCP registration, schemas, transport, errors and documentation         |
| `src/modules/`               | Shared domain functions and public models                              |
| `src/providers/`             | Source loading, validation and mapping; one document per provider      |
| `src/shared/`                | Metadata, pagination, cached snapshot readers and technical helpers    |
| `src/app.ts`, `src/index.ts` | Local server bootstrap and lifecycle                                   |
| `data/curated/`              | Five prepared JSON snapshots packaged with builds                      |
| `data/imported/`             | Optional unchanged originals; excluded from Git, builds and deployment |

`api/index.ts` is the REST Vercel entry point; `api/mcp.ts` only re-exports the
MCP entry point. Public requests never read the original files.

## Development and testing

`npm run check` runs typechecking, ESLint, Prettier, offline Vitest tests, the
build and compiled REST/MCP checks. CI runs the same command. Tests use curated
data and synthetic fixtures, never live APIs or ignored originals.

`npm run build` compiles into `dist/`, generates documentation and copies public
assets and curated data. `npm start` serves that build; rebuild and restart after
source changes. `npm run check:build` checks packaged execution from an unrelated
working directory. With the compiled server running, `npm run smoke` separately
checks live PEGELONLINE through REST and MCP; it is not part of the offline suite.

See [browser verification](docs/implementation-report.md#browser-verification)
for the existing optional browser smoke tests and
[data exploration](docs/implementation-report.md#optional-data-exploration) for
the separate Python notebook workflow.

## Deployment

The existing default production domain is
`https://schleswig-mcp-data-seven.vercel.app`; no custom domain is required.
Vercel uses two Node.js Functions and serves the allowlisted website assets from
`public/`. Both Functions explicitly include `data/curated/**/*.json`.

Use Node.js 24, Framework Preset **Other**, and the checked-in `vercel.json`
configuration (`npm ci`, `npm run build`, output directory `public`). Set
`PUBLIC_ORIGIN=https://schleswig-mcp-data-seven.vercel.app` in **Production**.
Leave it unset in **Preview** so `VERCEL_URL` selects the preview hostname.
`PUBLIC_ORIGIN` must be an HTTPS origin without credentials, path, query or
fragment; applying the production override to previews rejects preview requests.

Both Functions have a 15-second limit; PEGELONLINE requests have a five-second
timeout. Originals and local analysis artifacts are excluded by `.vercelignore`.
Repository files and complete datasets are not public static assets. Local tests
do not verify a deployment; follow the
[deployment verification checklist](docs/implementation-report.md#browser-verification)
after publishing an authorized change.

## Attribution and licensing

| Provider documentation                                     | Dataset license                                   |
| ---------------------------------------------------------- | ------------------------------------------------- |
| [PEGELONLINE / WSV](docs/datasources/pegelonline.md)       | DL-DE-Zero-2.0                                    |
| [LVermGeo SH](docs/datasources/geodata.md)                 | CC BY 4.0                                         |
| [Open Data SH monuments](docs/datasources/opendata-sh.md)  | CC BY 4.0                                         |
| [GovData-discovered datasets](docs/datasources/govdata.md) | Bathing-water CSV: CC BY 4.0; population: CC0 1.0 |
| [Bundesnetzagentur](docs/datasources/bundesnetzagentur.md) | CC BY 4.0                                         |

Responses retain source credits, license links and modification notices. Preserve
them when reusing data. Artwork credits are in [header icon sources](docs/header-icons.md).
**Source-code licensing remains undecided**; data, artwork and dependency licenses
do not grant a license to this project's source code.
