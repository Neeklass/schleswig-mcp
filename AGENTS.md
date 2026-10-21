# Working on Schleswig MCP

- Write code, comments, documentation, errors, public API/tool descriptions and
  commit messages in English. Preserve German original text, official names,
  identifiers and required source credits.
- Discuss substantial changes, work in small steps and follow approved scope.
  Respect uncommitted changes. Report changes and verification afterward.
- Never commit, push, publish or choose a source-code license without permission.
- Use strict TypeScript, native ES modules, npm, native fetch, Zod, the official
  MCP TypeScript SDK and Vitest. Verify compatible stable versions before upgrades.
- Prioritize correctness, simplicity, maintainability, type safety and testability.
  Avoid generic provider/plugin systems, databases, frameworks, infrastructure
  and placeholders without concrete requirements.

## Architecture

- REST-specific logic belongs exclusively in `api/`: routes, requests, query
  validation, HTTP security, statuses, errors and serialization. `api/index.ts`
  is the Vercel REST entry point.
- MCP-specific logic belongs exclusively in `mcp/`: initialization, tools,
  descriptions, protocol schemas, transport, validation and errors. `api/mcp.ts`
  is only the minimal re-export required for Vercel Function discovery.
- `src/app.ts` and `src/index.ts` are minimal local bootstraps. Do not restore
  `src/shared/http.ts` or `src/mcp/`.
- Shared functions and public models belong in `src/modules/`, including
  `src/modules/models/`. They must not depend on transports. REST/MCP call the
  same functions and interpret data identically.
- `src/providers/` represents providers/source catalogs, not individual datasets.
  Providers load, validate and map sources to domain models; one provider can
  supply several modules. Modules must not parse external CSV/API formats.
- Preserve 1:1 filenames: `src/providers/<provider>.ts` ↔
  `docs/datasources/<provider>.md`.
- Reused technical helpers belong in `src/shared/`. Keep metadata validation,
  domain models and pagination shared, without duplicate business logic.

Assignments: `pegelonline` → `water-level` and `water-level-history`; `geodata` → `addresses`;
`opendata-sh` → `monuments`; `bundesnetzagentur` → `car-charging-stations`;
`govdata` → `bathing-waters` and `population-forecast`; `regionalstatistik` →
`statistics` (population, population-movement, construction, tourism,
municipal-taxes). Preserve them.
The `geodata-sh` data folders identify LVermGeo SH; its provider/document are
named `geodata`.

## Data

- `data/imported/` holds unchanged originals. Never modify, move, overwrite,
  delete or commit them. Exclude them from formatting, linting, builds and
  deployment. They are optional and are never production request sources.
- `data/curated/` holds manually prepared static API JSON. Use `{metadata, data}`,
  shared metadata and dataset-specific record schemas. Do not introduce automatic
  preparation, additional products or replacement snapshots implicitly. The
  approved exception is `.github/workflows/update-data.yml`: it appends days to
  `data/curated/pegelonline/water-level-daily.json`, refreshes
  `data/curated/regionalstatistik/*.json` and proposes changes only in the
  rolling `data-update` pull request. Keep stored water-level days immutable.
  Regionaldatenbank credentials come only from repository secrets; never write,
  log or request them in chat.
- Change curated content only when the error and correction are evidenced;
  document corrections. Do not decide Git inclusion without owner authorization.
  Gold files must accompany static-feature builds and deployments.
- Validate metadata, counts, unique IDs, required fields, types, coordinates,
  dates and dataset-specific relationships. Schleswig city AGS is `01059075`;
  do not confuse it with Schleswig-Flensburg or Schleswig-Holstein.
- Distinguish domain dates, source publication/updates, actual downloads and
  preparation timestamps. Use null when unsupported; never infer event times
  from filenames or filesystem timestamps.
- Verify provider, publisher, catalog, links, each dataset's license and credits.
  Retain CC BY credits, license links and notices of modification. Data licensing
  does not license source code.
- Keep explicit original readers separate from cached Gold readers. Neither
  prepares data. Do not load originals per request. Cache validated snapshots
  read-only; restart/redeploy after replacement.
- The current PEGELONLINE reading stays live; only its daily history is a Gold
  file. Missing, invalid, unavailable and stale measurements
  are distinct. A gauge reading is not water depth.

## Checks and documentation

- Run `npm run check` for implementation changes: typecheck, lint, formatting,
  offline tests, build and compiled REST/MCP checks.
- Tests use Gold files and synthetic fixtures, never live APIs or ignored
  originals. Verify live integration separately when relevant.
- Verify source and build paths and packaged Gold access. Vercel must include
  Gold explicitly. Never accept client-controlled paths or serve repository files.
- Bound list responses with common pagination. Public errors are safe and English.
- Update README and relevant documents for behavior/setup changes. Source docs
  identify publisher/catalog, official endpoint/download, original format,
  Gold files/count/scope, dates, processing, license/credit, update procedure,
  provider/modules, integration status and limitations. Show ignored originals
  as code paths, not broken relative links.
- Keep optional Python exploration and historical filters separate from Node.js.
  Respect notebook settings and outputs. Do not claim deployment verification
  based only on local tests.
