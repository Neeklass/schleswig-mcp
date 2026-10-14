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

Data license: DL-DE-Zero-2.0. Source-code license: not yet selected.
