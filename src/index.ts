import { createApp } from './shared/http.ts';

const rawPort = process.env['PORT'] ?? '3000';
if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65_535) {
  console.error('PORT must be an integer between 1 and 65535.');
  process.exit(1);
}

const port = Number(rawPort);
const app = createApp();

app.server.on('error', (error) => {
  console.error(`Unable to run Schleswig MCP: ${error.message}`);
  process.exitCode = 1;
});
app.server.listen(port, '127.0.0.1', () => {
  console.error(
    `Schleswig API: http://127.0.0.1:${port}/api/v1/schleswig/water-level`,
  );
  console.error(`Schleswig MCP: http://127.0.0.1:${port}/mcp`);
});

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  try {
    await app.close();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});
