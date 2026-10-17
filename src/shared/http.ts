import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { toNodeHandler } from '@modelcontextprotocol/node';
import {
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  validateHostHeader,
  validateOriginHeader,
} from '@modelcontextprotocol/server';
import { publicError } from './errors.ts';
import { createWaterLevelMcp } from '../mcp/mcp.ts';
import { getSchleswigWaterLevel } from '../modules/water-level.ts';
import type { GetWaterLevel } from '../modules/water-level.ts';

export const API_PATH = '/api/v1/schleswig/water-level';

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

export function createApp(
  getWaterLevel: GetWaterLevel = getSchleswigWaterLevel,
) {
  const mcp = createWaterLevelMcp(getWaterLevel);
  const handleMcp = toNodeHandler(mcp, { maxRequestBodySize: 64 * 1_024 });
  const allowedHosts = localhostAllowedHostnames();
  const allowedOrigins = localhostAllowedOrigins();

  async function handle(request: IncomingMessage, response: ServerResponse) {
    let path: string;
    try {
      path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    } catch {
      json(response, 400, {
        error: { code: 'BAD_REQUEST', message: 'Invalid request target.' },
      });
      return;
    }
    const rejected = [
      validateHostHeader(request.headers.host, allowedHosts),
      validateOriginHeader(request.headers.origin, allowedOrigins),
    ].find((result) => !result.ok);
    if (rejected && !rejected.ok) {
      json(
        response,
        403,
        path === '/mcp'
          ? {
              jsonrpc: '2.0',
              error: { code: -32000, message: rejected.message },
              id: null,
            }
          : { error: { code: 'FORBIDDEN', message: rejected.message } },
      );
      return;
    }
    if (path === '/mcp') {
      const mcpRequest = Object.assign(request, {
        method: request.method ?? 'GET',
        url: request.url ?? '/',
      });
      await handleMcp(mcpRequest, response);
      return;
    }
    if (path !== API_PATH) {
      json(response, 404, {
        error: { code: 'NOT_FOUND', message: 'Route not found.' },
      });
      return;
    }
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      json(response, 405, {
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Use GET for this endpoint.',
        },
      });
      return;
    }
    json(response, 200, await getWaterLevel());
  }

  const server = createServer(
    { requestTimeout: 10_000, headersTimeout: 10_000 },
    (request, response) => {
      void handle(request, response).catch((error: unknown) => {
        const failure = publicError(error);
        if (failure.status === 500) console.error(error);
        if (!response.headersSent && !response.destroyed)
          json(response, failure.status, failure.body);
        else response.destroy();
      });
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
