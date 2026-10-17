import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Explicit public files only. Request paths are never used as filesystem paths.
export const websiteFiles: Record<string, { file: string; type: string }> = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/docs': { file: 'docs.html', type: 'text/html; charset=utf-8' },
  '/mcp-docs': { file: 'mcp-docs.html', type: 'text/html; charset=utf-8' },
  '/openapi.json': {
    file: 'openapi.json',
    type: 'application/json; charset=utf-8',
  },
  '/styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },
  '/docs.js': { file: 'docs.js', type: 'text/javascript; charset=utf-8' },
};

// Local development and compiled Node server; Vercel serves public/ directly.
export async function serveWebsite(
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
) {
  const asset = Object.hasOwn(websiteFiles, path)
    ? websiteFiles[path]
    : undefined;
  if (!asset) return false;
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return true;
  }
  const body = await readFile(
    new URL(`../../public/${asset.file}`, import.meta.url),
  );
  response.writeHead(200, {
    'Content-Type': asset.type,
    'Cache-Control': 'no-cache',
  });
  response.end(request.method === 'HEAD' ? undefined : body);
  return true;
}
