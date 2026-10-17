import type { IncomingMessage, ServerResponse } from 'node:http';
import { toNodeHandler } from '@modelcontextprotocol/node';
import {
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  validateHostHeader,
  validateOriginHeader,
} from '@modelcontextprotocol/server';
import { createSchleswigMcp } from './mcp.ts';
import type { GetWaterLevel } from '../src/modules/water-level.ts';
import { getSchleswigWaterLevel } from '../src/modules/water-level.ts';
import { deploymentOrigin } from '../src/shared/deployment.ts';

export function createMcpEndpoint(
  getWaterLevel: GetWaterLevel = getSchleswigWaterLevel,
  origin?: string,
) {
  const mcp = createSchleswigMcp(getWaterLevel);
  const handler = toNodeHandler(mcp, { maxRequestBodySize: 64 * 1024 });
  const hosts = origin
    ? [new URL(origin).hostname]
    : localhostAllowedHostnames();
  const origins = origin
    ? [new URL(origin).hostname]
    : localhostAllowedOrigins();
  function error(
    response: ServerResponse,
    status: number,
    code: number,
    message: string,
  ) {
    response.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(
      JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }),
    );
  }
  return {
    close: mcp.close,
    async handle(request: IncomingMessage, response: ServerResponse) {
      const incomingOrigin = request.headers.origin;
      let invalidOrigin = false;
      if (incomingOrigin) {
        try {
          invalidOrigin =
            new URL(incomingOrigin).origin !== incomingOrigin ||
            (origin !== undefined && incomingOrigin !== origin);
        } catch {
          invalidOrigin = true;
        }
      }
      if (
        /[\s/@?#\\]/.test(request.headers.host ?? '') ||
        invalidOrigin ||
        !validateHostHeader(request.headers.host, hosts).ok ||
        !validateOriginHeader(incomingOrigin, origins).ok
      ) {
        error(response, 403, -32000, 'Host or Origin is not allowed.');
        return;
      }
      if (request.url !== '/mcp' && request.url !== '/api/mcp') {
        error(response, 400, -32600, 'Invalid MCP request target.');
        return;
      }
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      try {
        // Vercel may have parsed the body before invoking the Node.js handler.
        const parsedBody: unknown =
          'body' in request ? request.body : undefined;
        if (
          parsedBody !== undefined &&
          Buffer.byteLength(JSON.stringify(parsedBody)) > 64 * 1024
        ) {
          error(response, 413, -32600, 'MCP request body exceeds 64 KiB.');
          return;
        }
        await handler(
          Object.assign(request, {
            method: request.method ?? 'GET',
            url: request.url ?? '/mcp',
          }),
          response,
          parsedBody,
        );
      } catch (cause) {
        console.error(cause);
        if (!response.headersSent && !response.destroyed)
          error(response, 500, -32603, 'An unexpected error occurred.');
        else response.destroy();
      }
    },
  };
}

let endpoint: ReturnType<typeof createMcpEndpoint> | undefined;
export default function handle(
  request: IncomingMessage,
  response: ServerResponse,
) {
  endpoint ??= createMcpEndpoint(getSchleswigWaterLevel, deploymentOrigin());
  return endpoint.handle(request, response);
}
