import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';

// Load compiled modules after changing cwd to catch accidental repository-relative I/O.
process.chdir(tmpdir());
const { createApp } = await import('../dist/src/app.js');
const app = createApp(async () => {
  throw new Error('Build check must not fetch live measurements.');
});
const client = new Client({ name: 'build-check', version: '1.0.0' });
try {
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const base = `http://127.0.0.1:${app.server.address().port}`;
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/mcp`)),
  );
  for (const [route, tool, total] of [
    ['addresses', 'list_schleswig_addresses', 7619],
    ['monuments', 'list_schleswig_monuments', 251],
    ['bathing-waters', 'list_schleswig_bathing_waters', 2],
    ['charging-stations', 'list_schleswig_charging_stations', 61],
    ['population-forecast', 'list_schleswig_population_forecast', 39],
  ]) {
    const response = await fetch(`${base}/api/v1/schleswig/${route}?limit=1`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.pagination.total, total);
    const result = await client.callTool({
      name: tool,
      arguments: { limit: 1 },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(result.structuredContent, data);
  }
  console.log(
    'Compiled REST/MCP and all five packaged datasets passed from an unrelated working directory.',
  );
} finally {
  await client.close();
  await app.close();
}
