import { createServer } from 'node:http';
import { createRestHandler } from '../api/index.ts';
import { createMcpEndpoint } from '../mcp/index.ts';
import { getSchleswigWaterLevel } from './modules/water-level.ts';
import type { GetWaterLevel } from './modules/water-level.ts';
import { deploymentOrigin } from './shared/deployment.ts';

// Minimal local bootstrap; protocol handling stays in api/ and mcp/.
export function createApp(
  getWaterLevel: GetWaterLevel = getSchleswigWaterLevel,
  origin = deploymentOrigin(),
) {
  const rest = createRestHandler(getWaterLevel, origin);
  const mcp = createMcpEndpoint(getWaterLevel, origin);
  const server = createServer(
    { requestTimeout: 10_000, headersTimeout: 10_000 },
    (request, response) => {
      const path = request.url?.split('?')[0];
      void (path === '/mcp' || path === '/api/mcp'
        ? mcp.handle(request, response)
        : rest(request, response));
    },
  );
  async function close() {
    const stopped = new Promise<void>((resolve, reject) => {
      if (!server.listening) {
        resolve();
        return;
      }
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await mcp.close();
    server.closeAllConnections();
    await stopped;
  }
  return { server, close };
}
