import assert from 'node:assert/strict';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { waterLevelSchema } from '../dist/water-level.js';

const base = `http://127.0.0.1:${process.env.PORT ?? '3000'}`;
const client = new Client({ name: 'schleswig-smoke', version: '1.0.0' });

try {
  const response = await fetch(`${base}/api/v1/schleswig/water-level`, {
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(
    response.status,
    200,
    `HTTP API returned ${response.status}: ${await response.clone().text()}`,
  );
  const api = waterLevelSchema.parse(await response.json());
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/mcp`)),
  );
  const { tools } = await client.listTools();
  assert.ok(tools.some((tool) => tool.name === 'get_schleswig_water_level'));
  const result = await client.callTool({
    name: 'get_schleswig_water_level',
    arguments: {},
  });
  assert.notEqual(result.isError, true, JSON.stringify(result.content));
  const mcp = waterLevelSchema.parse(result.structuredContent);
  assert.equal(api.station.id, mcp.station.id);
  assert.equal(api.measurement.unit, mcp.measurement.unit);
  console.log('Live HTTP API and MCP tool checks passed.');
  console.log(
    JSON.stringify(
      { api: api.measurement, mcp: mcp.measurement, freshness: mcp.freshness },
      null,
      2,
    ),
  );
} finally {
  await client.close();
}
