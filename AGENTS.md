# Working on Schleswig MCP

- Write code, comments, documentation,
  and commit messages in English.
- Discuss substantial changes and work in small steps. Follow the scope explicitly
  approved in the conversation; report changes and verification results afterward.
- Never commit, push, publish, or choose a source-code license without permission.
- Prioritize correctness, simplicity, maintainability, type safety, and testability.
- Use strict TypeScript, native ES modules, npm, native fetch, Zod, the official
  MCP TypeScript SDK, and Vitest. Verify compatible stable versions before upgrades.
- Keep HTTP and MCP adapters thin. Both call the same domain modules.
- Validate external data at the boundary. Distinguish unavailable, invalid, missing,
  and stale measurements. A gauge reading is not water depth.
- Use verified public data sources with documented licenses and attribution.
  Keep source-code licensing separate from data licensing.
- Avoid speculative abstractions, additional infrastructure, and unrelated changes.
- Run `npm run check` for implementation changes. Automated tests must not depend
  on the live upstream service. Verify live integration separately when relevant.
- Update the README and relevant documents when behavior or setup changes.

## Architecture and data sources

The project follows a modular, source-independent architecture.

- `src/modules/` contains only implemented domain functions and models exposed
  through REST or MCP. Only `water-level.ts` is currently active. Preserve the
  existing comment-only files and their intended provider assignments; they are
  not implemented features. Do not add further placeholder modules.
- `src/providers/` groups integrations by external provider or source catalog,
  not by module or individual dataset. One provider can serve multiple modules.
  Keep source parsing, validation, and mapping here; do not create separate
  providers for datasets already covered by an existing provider.
- `docs/datasources/<name>.md` corresponds 1:1 to `src/providers/<name>.ts`.
  Each document may describe multiple datasets, endpoints, and data products.
  Distinguish the publisher, catalog, optional local original, implemented
  provider, and actual public integration.
- `src/shared/` contains common technical helpers, errors, and the HTTP adapter
  in `http.ts`. These helpers are not providers. The MCP adapter is
  `src/mcp/mcp.ts`; both adapters call `src/modules/water-level.ts`.
- `data/imported/` contains unchanged original downloads, grouped by source.
  Keep them out of Git, formatting, linting, and builds. Do not move, overwrite,
  or delete originals. They are not intended for direct production API use.
  Tests and builds must work without them. Document how to obtain them again.
- `data/curated/` is reserved for datasets manually prepared by the project owner,
  reduced to the needed information in a suitable compact format such as Parquet.
  No preparation pipeline, conversion, or curated-data reader is implemented.
  Do not decide whether these future files belong in Git without authorization.

Current assignments: `pegelonline.ts` supplies the active `water-level.ts` module.
The comments in `monuments.ts`, `car-charging-stations.ts`, `bathing-waters.ts`,
`population-forecast.ts`, and `addresses.ts` assign future features to
`opendata-sh.ts`, `bundesnetzagentur.ts`, `govdata.ts` (both bathing waters and
population), and `geodata.ts`, respectively. The `geodata-sh` comment identifies
LVermGeo SH; the raw-data folder keeps that name. These comments do not register
REST endpoints or MCP tools.

REST handlers and MCP tools must not communicate directly with external APIs or
parse source files. Adding a provider does not authorize a public endpoint.

Source-specific integrations are responsible for fetching or loading data, validating it, and mapping it to domain-specific data models.

Domain modules must not depend on the original format of an external API, CSV export, or manually maintained dataset.

Prefer simple, explicit implementations. Do not create generic provider interfaces, plugin systems, abstract base classes, databases, or complex data pipelines until a concrete requirement justifies them.

Do not create empty directories or placeholder files for future features.

Each new data source must include appropriate validation, tests, and source documentation.

Distinguish publishers from discovery catalogs such as GovData. Source documents
must state the official endpoint, format, license, attribution, update procedure,
limitations, associated provider, and whether the data is exposed by the API.
Keep the existing explicit source readers separate from future manual data
preparation. Do not introduce automatic preparation or conversion. Future
providers may read `data/curated/` when needed; large original snapshots must not
be loaded on every API request. Do not make the running water-level module,
tests, or builds depend on optional imported or curated files.
