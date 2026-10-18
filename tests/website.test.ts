import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import {
  Client,
  fromJsonSchema,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.ts';
import {
  createOpenApi,
  restDocumentation,
  waterLevelExample,
} from '../api/_lib/openapi.ts';
import { websiteFiles } from '../api/_lib/website.ts';
import { listQuerySchema } from '../src/shared/pagination.ts';

const app = createApp(async () => waterLevelExample);
const client = new Client({ name: 'website-check', version: '1.0.0' });
const document = await createOpenApi();
let base: string;
beforeAll(async () => {
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const address = app.server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected TCP address.');
  base = `http://127.0.0.1:${address.port}`;
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/mcp`)),
  );
});
afterAll(async () => {
  await client.close();
  await app.close();
});

// Validate the OpenAPI objects used here and every embedded schema/example.
const mediaSchema = z.object({
  schema: z.object({ $ref: z.string() }),
  examples: z.object({ sample: z.object({ value: z.unknown() }) }),
});
const operationSchema = z.object({
  get: z.object({
    operationId: z.string().min(1),
    parameters: z.array(
      z.object({
        name: z.enum(['id', 'q', 'limit', 'offset']),
        in: z.literal('query'),
        required: z.literal(false),
        schema: z.record(z.string(), z.unknown()),
      }),
    ),
    responses: z.object({
      '200': z.object({
        content: z.object({ 'application/json': mediaSchema }),
      }),
    }),
  }),
});

describe('public website', () => {
  it.each(Object.keys(websiteFiles))(
    'serves the allowlisted asset %s for GET and HEAD',
    async (path) => {
      const response = await fetch(`${base}${path}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe(
        websiteFiles[path]!.type,
      );
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect((await response.text()).length).toBeGreaterThan(100);
      const head = await fetch(`${base}${path}`, { method: 'HEAD' });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe('');
    },
  );
  it('keeps only explicitly published files in public/', async () => {
    const files = await readdir(new URL('../public/', import.meta.url), {
      recursive: true,
    });
    expect(files.map((file) => file.replaceAll('\\', '/')).sort()).toEqual(
      ['icons', ...Object.values(websiteFiles).map(({ file }) => file)].sort(),
    );
  });
  it('serves self-contained local icons and preserves the official MCP geometry', async () => {
    for (const name of ['rest-api', 'mcp', 'github']) {
      const response = await fetch(`${base}/icons/${name}.svg`);
      expect(response.headers.get('content-type')).toBe(
        'image/svg+xml; charset=utf-8',
      );
      const svg = await response.text();
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).not.toMatch(/<(?:script|image|use|foreignObject)\b|\bhref=/);
      expect(
        (await fetch(`${base}/icons/${name}.svg`, { method: 'POST' })).status,
      ).toBe(405);
      if (name === 'mcp') {
        expect(svg).toContain('viewBox="0 0 195 195"');
        const paths = [...svg.matchAll(/\bd="([^"]+)"/g)].map(
          (match) => match[1],
        );
        expect(paths).toHaveLength(3);
        // Fingerprint of the three unmodified official symbol paths, without wordmark.
        expect(
          createHash('sha256').update(JSON.stringify(paths)).digest('hex'),
        ).toBe(
          '5518a898a1cffb5968b4dfbebed8b7db405a3a73d134312eb39dd62165ec7023',
        );
      }
    }
  });
  it.each([
    '/src/index.ts',
    '/api/_lib/openapi.ts',
    '/mcp/documentation.html',
    '/dist/src/index.js',
    '/data/curated/geodata-sh/addresses.json',
    '/data/imported/example.csv',
    '/.env',
    '/vercel.json',
    '/package.json',
    '/schleswig-logo.png',
    '/icons',
    '/icons/other.svg',
    '/icons/mcpXsvg',
    '/icons/mcp.svg/extra',
    '/icons/%2e%2e%2fpackage.json',
    '/__proto__',
    '/%2e%2e%2fpackage.json',
  ])('does not expose %s', async (path) => {
    expect((await fetch(`${base}${path}`)).status).toBe(404);
  });
  it('rejects foreign origins and unsupported website methods', async () => {
    expect(
      (
        await fetch(`${base}/docs`, {
          headers: { Origin: 'https://foreign.example' },
        })
      ).status,
    ).toBe(403);
    const response = await fetch(`${base}/docs`, { method: 'POST' });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
    expect((await fetch(`${base}/mcp`)).status).toBe(405);
  });
  it('links the homepage and loads a pinned Scalar client without a proxy', async () => {
    const home = await (await fetch(`${base}/`)).text();
    for (const path of ['/docs', '/mcp-docs', '/openapi.json'])
      expect(home).toContain(`href="${path}"`);
    const html = await (await fetch(`${base}/docs`)).text();
    expect(html).toContain('id="rest-reference"');
    // Scalar's standalone ESM also auto-mounts the legacy ID, creating an
    // unconfigured second instance with permanent introduction skeletons.
    expect(html).not.toMatch(/id="api-reference"|data-spec(?:-url)?=/);
    expect(html).toContain('href="#rest-reference"');
    expect(html).toContain('src="/docs.js"');
    const js = await (await fetch(`${base}/docs.js`)).text();
    expect(js).toContain('@scalar/api-reference@1.75.0/esm.js');
    expect(js).toContain("fetch('/openapi.json'");
    expect(js).not.toContain('proxyUrl');
  });
  it('keeps the homepage source note and request example concise', async () => {
    const html = await (await fetch(`${base}/`)).text();
    const sources = html.match(
      /<section aria-labelledby="sources">([\s\S]*?)<\/section>/,
    )![1]!;
    expect(sources.match(/<p>/g)).toHaveLength(1);
    expect(sources.replace(/\s+/g, ' ')).toContain(
      'Data comes from public sources. Responses include source, license, date, and limitation information. Most datasets are snapshots; only water levels are retrieved live.',
    );
    expect(sources).not.toContain('<a');
    const request = html.match(
      /<section aria-labelledby="example-requests">([\s\S]*?)<\/section>/,
    )![1]!;
    expect(request).toContain('Start with a request');
    expect(request).toContain(
      'Dataset lists default to 20 records and allow at most 100 per request.',
    );
    expect(request).toContain(
      'GET /api/v1/schleswig/addresses?q=Abelsteg&amp;limit=5',
    );
    expect(request).toContain('GET /api/v1/schleswig/water-level');
    const afterCode = request.split('</pre>')[1]!;
    expect(afterCode.replace(/<[^>]+>/g, '').trim()).toBe(
      'View the address example',
    );
    expect(afterCode).toContain(
      'href="/api/v1/schleswig/addresses?q=Abelsteg&amp;limit=5"',
    );
    const response = await fetch(
      `${base}/api/v1/schleswig/addresses?q=Abelsteg&limit=5`,
    );
    expect(response.status).toBe(200);
  });
  it.each(['/', '/docs', '/mcp-docs'])(
    'provides independent text branding and accessible navigation on %s',
    async (path) => {
      const html = await (await fetch(`${base}${path}`)).text();
      expect(html).toMatch(
        /class="site-wordmark" href="\/"[^>]*>Schleswig MCP</,
      );
      expect(html).toContain('class="site-nav" aria-label="Main navigation"');
      expect(html).toContain('aria-current="page"');
      expect(html).toContain('class="skip-link"');
      expect(html).toContain('tabindex="-1"');
      expect(html.replace(/\s+/g, ' ')).toContain(
        'Not operated or endorsed by the City of Schleswig.',
      );
      expect(html).not.toMatch(/<img\b|schleswig-logo/);
      const repositoryLinks = html.match(
        /href="https:\/\/github\.com\/Neeklass\/schleswig-mcp[^"\s]*"/g,
      );
      expect(repositoryLinks).toEqual([
        'href="https://github.com/Neeklass/schleswig-mcp"',
      ]);
      const nav = html.match(
        /<nav class="site-nav"[^>]*>([\s\S]*?)<\/nav>/,
      )![1]!;
      for (const [href, label, icon] of [
        ['/docs', 'REST API documentation', 'rest-api'],
        ['/mcp-docs', 'MCP documentation', 'mcp'],
        [
          'https://github.com/Neeklass/schleswig-mcp',
          'GitHub repository',
          'github',
        ],
      ]) {
        const link = nav.match(
          new RegExp(`<a\\s+href="${href}"[^>]*>([\\s\\S]*?)<\\/a\\s*>`),
        )!;
        expect(link[0]).toContain(`aria-label="${label}"`);
        expect(link[0]).toContain(`title="${label}"`);
        expect(link[1]).toContain('aria-hidden="true"');
        expect(link[1]).toContain(`class="site-icon site-icon-${icon}"`);
        expect(link[1]).not.toMatch(/<svg|<path|<img/);
        expect(link[1]!.replace(/<!--[\s\S]*?-->|<[^>]*>/g, '').trim()).toBe(
          '',
        );
      }
      expect(nav).toContain('id="theme-control"');
      expect(nav).toContain('type="button"');
      expect(html).toMatch(
        /<script src="\/docs.js"><\/script>\s*<link rel="stylesheet"/,
      );
      expect(html.match(/src="\/docs.js"/g)).toHaveLength(1);
    },
  );
  it('keeps editorial styles outside the full-width Scalar mount', async () => {
    const css = await (await fetch(`${base}/styles.css`)).text();
    // Unlayered element selectors override Scalar's layered component styles.
    expect(css).not.toMatch(
      /(?:^|[},])\s*(?:nav|a|code|pre|table|th|td|summary|main|header|h1|h2|p|\*)\s*[{,:]/m,
    );
    const html = await (await fetch(`${base}/docs`)).text();
    expect(html).toMatch(
      /<\/section>\s*<main\s+id="rest-reference"[^>]*><\/main>/,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Reload the reference');
    expect(html).toContain('requires JavaScript');
  });
  it('serves the current generated OpenAPI and MCP examples', async () => {
    expect(await (await fetch(`${base}/openapi.json`)).json()).toEqual(
      document,
    );
    const tools = (await client.listTools()).tools;
    expect(tools).toHaveLength(6);
    const html = await (await fetch(`${base}/mcp-docs`)).text();
    expect(html).not.toContain('<!-- TOOL_REFERENCE -->');
    for (const tool of tools) {
      expect(html).toContain(`id="${tool.name}"`);
      const match = html.match(
        new RegExp(
          `<pre data-tool="${tool.name}"><code>([\\s\\S]*?)</code></pre>`,
        ),
      );
      expect(match).not.toBeNull();
      const example: unknown = JSON.parse(
        match![1]!
          .replaceAll('&lt;', '<')
          .replaceAll('&gt;', '>')
          .replaceAll('&quot;', '"')
          .replaceAll('&#39;', "'")
          .replaceAll('&amp;', '&'),
      );
      const result = await client.callTool({
        name: tool.name,
        arguments: tool.name.startsWith('get_') ? {} : { limit: 1 },
      });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toEqual(example);
    }
  });
});

describe('Scalar loading feedback', () => {
  afterEach(() => vi.useRealTimers());

  async function runLoader(
    options: {
      response?: Response;
      fetchError?: boolean;
      importError?: boolean;
      mountError?: boolean;
      stalledImport?: boolean;
      systemDark?: boolean;
      stored?: string;
      storageBlocked?: boolean;
      noReference?: boolean;
    } = {},
  ) {
    vi.useFakeTimers();
    const elements = Object.fromEntries(
      ['docs-status', 'docs-feedback', 'rest-reference', 'theme-control'].map(
        (id) => [
          id,
          {
            hidden: false,
            textContent: '',
            title: '',
            setAttribute: vi.fn(),
            addEventListener: vi.fn(),
            classList: { toggle: vi.fn() },
          },
        ],
      ),
    );
    type Configuration = {
      content: typeof document;
      onLoaded: () => void;
      darkMode: boolean;
    };
    const createApiReference = vi.fn<
      (selector: string, configuration: Configuration) => void
    >(() => {
      if (options.mountError) throw new Error('Synthetic mount failure.');
    });
    const fetchDocument = vi.fn(() =>
      options.fetchError
        ? Promise.reject(new Error('Synthetic network failure.'))
        : Promise.resolve(options.response ?? Response.json(document)),
    );
    const loadScalar = vi.fn(() => {
      if (options.importError)
        return Promise.reject(new Error('CDN unavailable.'));
      if (options.stalledImport) return new Promise(() => {});
      return Promise.resolve({ createApiReference });
    });
    const source = await readFile(
      new URL('../public/docs.js', import.meta.url),
      'utf8',
    );
    // Execute the shipped loader offline; substitute only the remote module boundary.
    const offlineSource = source.replace(
      /import\('https:\/\/cdn\.jsdelivr\.net\/npm\/@scalar\/api-reference@[^']+'\)/,
      'loadScalar()',
    );
    expect(offlineSource).not.toBe(source);
    const root = {
      dataset: {} as Record<string, string>,
      style: {} as Record<string, string>,
    };
    const ready = vi.fn();
    const system = {
      matches: options.systemDark ?? false,
      addEventListener: vi.fn(),
    };
    const storage = {
      getItem: vi.fn(() => {
        if (options.storageBlocked) throw new Error('Blocked');
        return options.stored ?? null;
      }),
      setItem: vi.fn(() => {
        if (options.storageBlocked) throw new Error('Blocked');
      }),
      removeItem: vi.fn(() => {
        if (options.storageBlocked) throw new Error('Blocked');
      }),
    };
    const windowEvents = vi.fn();
    runInNewContext(offlineSource, {
      document: {
        documentElement: root,
        addEventListener: ready,
        getElementById: (id: string) =>
          options.noReference && id === 'rest-reference' ? null : elements[id],
      },
      window: {
        matchMedia: () => system,
        localStorage: storage,
        addEventListener: windowEvents,
      },
      fetch: fetchDocument,
      AbortSignal,
      setTimeout,
      clearTimeout,
      loadScalar,
    });
    const initial = { ...root.dataset };
    const pending = (ready.mock.calls[0]![1] as () => Promise<void>)();
    const click = () =>
      (
        elements['theme-control']!.addEventListener.mock
          .calls[0]![1] as () => void
      )();
    const systemChange = (dark: boolean) => {
      system.matches = dark;
      (system.addEventListener.mock.calls[0]![1] as () => void)();
    };
    return {
      elements,
      createApiReference,
      fetchDocument,
      pending,
      root,
      initial,
      click,
      systemChange,
      storage,
      windowEvents,
    };
  }

  it('waits for Scalar onLoaded and passes the complete same-origin document', async () => {
    const loader = await runLoader();
    await loader.pending;
    expect(loader.fetchDocument.mock.calls).toHaveLength(1);
    expect(loader.createApiReference).toHaveBeenCalledWith(
      '#rest-reference',
      expect.objectContaining({
        content: document,
        showSidebar: true,
        withDefaultFonts: false,
      }),
    );
    expect(loader.elements['docs-feedback']!.hidden).toBe(false);
    expect(loader.elements['docs-status']!.textContent).toContain('Loading');
    loader.createApiReference.mock.calls[0]![1].onLoaded();
    expect(loader.elements['docs-feedback']!.hidden).toBe(true);
    expect(
      loader.elements['rest-reference']!.setAttribute,
    ).toHaveBeenLastCalledWith('aria-busy', 'false');
    await vi.advanceTimersByTimeAsync(20000);
    expect(loader.elements['docs-feedback']!.hidden).toBe(true);
  });

  it.each([false, true])(
    'applies system preference before DOMContentLoaded: dark=%s',
    async (systemDark) => {
      const loader = await runLoader({ systemDark, noReference: true });
      await loader.pending;
      expect(loader.initial).toEqual({
        themeMode: 'system',
        theme: systemDark ? 'dark' : 'light',
      });
      expect(loader.fetchDocument).not.toHaveBeenCalled();
      expect(loader.createApiReference).not.toHaveBeenCalled();
      loader.systemChange(!systemDark);
      expect(loader.root.dataset.theme).toBe(systemDark ? 'light' : 'dark');
    },
  );

  it.each(['light', 'dark'])(
    'restores explicit %s and ignores system changes',
    async (stored) => {
      const loader = await runLoader({
        stored,
        systemDark: stored === 'light',
      });
      await loader.pending;
      expect(loader.initial).toEqual({ themeMode: stored, theme: stored });
      loader.systemChange(false);
      loader.systemChange(true);
      expect(loader.root.dataset.theme).toBe(stored);
      expect(loader.createApiReference.mock.calls[0]![1].darkMode).toBe(
        stored === 'dark',
      );
    },
  );

  it.each([false, true])(
    'cycles and synchronizes one Scalar instance when storage is blocked=%s',
    async (storageBlocked) => {
      const loader = await runLoader({ storageBlocked });
      await loader.pending;
      loader.createApiReference.mock.calls[0]![1].onLoaded();
      loader.click();
      expect(loader.storage.setItem).toHaveBeenLastCalledWith(
        'schleswig-theme',
        'light',
      );
      loader.click();
      expect(loader.root.dataset.theme).toBe('dark');
      expect(loader.storage.setItem).toHaveBeenLastCalledWith(
        'schleswig-theme',
        'dark',
      );
      expect(
        loader.elements['rest-reference']!.classList.toggle,
      ).toHaveBeenCalledWith('dark-mode', true);
      expect(
        loader.elements['rest-reference']!.classList.toggle,
      ).toHaveBeenLastCalledWith('light-mode', false);
      expect(loader.elements['theme-control']!.title).toBe(
        'Theme: Dark. Switch to System.',
      );
      loader.click();
      expect(loader.storage.removeItem).toHaveBeenCalledWith('schleswig-theme');
      expect(loader.root.dataset.themeMode).toBe('system');
      loader.systemChange(true);
      expect(loader.root.dataset.theme).toBe('dark');
      expect(loader.createApiReference).toHaveBeenCalledTimes(1);
    },
  );

  it('ignores invalid stored values and follows changes from another tab', async () => {
    const loader = await runLoader({ stored: 'invalid', noReference: true });
    await loader.pending;
    expect(loader.initial.themeMode).toBe('system');
    const storageChanged = loader.windowEvents.mock.calls[0]![1] as (event: {
      key: string | null;
      newValue: string | null;
    }) => void;
    storageChanged({ key: 'schleswig-theme', newValue: 'dark' });
    expect(loader.root.dataset.theme).toBe('dark');
    storageChanged({ key: null, newValue: null });
    expect(loader.root.dataset.themeMode).toBe('system');
  });

  it.each([
    { importError: true },
    { fetchError: true },
    { response: new Response('Unavailable', { status: 503 }) },
    { response: new Response('<html>Not JSON</html>') },
    { response: Response.json(null) },
    { response: Response.json({ openapi: '3.1.0', paths: {} }) },
    { mountError: true },
  ])(
    'reports loading failures without exposing internal errors: %j',
    async (options) => {
      const loader = await runLoader(options);
      await loader.pending;
      expect(loader.elements['docs-feedback']!.hidden).toBe(false);
      expect(loader.elements['docs-status']!.textContent).toContain(
        'could not load',
      );
      expect(loader.elements['docs-status']!.textContent).not.toContain(
        'Synthetic',
      );
      expect(
        loader.elements['rest-reference']!.setAttribute,
      ).toHaveBeenLastCalledWith('aria-busy', 'false');
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('reports a stalled CDN import after twenty seconds', async () => {
    const loader = await runLoader({ stalledImport: true });
    await vi.advanceTimersByTimeAsync(20000);
    expect(loader.elements['docs-status']!.textContent).toContain(
      'could not load',
    );
    expect(loader.createApiReference).not.toHaveBeenCalled();
  });

  it('reports an asynchronous render stall and recovers from a late load', async () => {
    const loader = await runLoader();
    await loader.pending;
    await vi.advanceTimersByTimeAsync(20000);
    expect(loader.elements['docs-status']!.textContent).toContain(
      'could not load',
    );
    loader.createApiReference.mock.calls[0]![1].onLoaded();
    expect(loader.elements['docs-feedback']!.hidden).toBe(true);
    expect(loader.elements['docs-status']!.textContent).toBe(
      'API reference loaded.',
    );
  });
});

describe('OpenAPI contract', () => {
  it('does not add repository deep links to public documentation', () => {
    expect(JSON.stringify(document)).not.toMatch(
      /https:\/\/github\.com\/Neeklass\/schleswig-mcp\//,
    );
  });
  it('uses OpenAPI 3.1 with a relative server and exactly six GET operations', () => {
    expect(document.openapi).toBe('3.1.0');
    expect(document.jsonSchemaDialect).toBe(
      'https://json-schema.org/draft/2020-12/schema',
    );
    expect(document.servers).toEqual([
      { url: '/', description: expect.any(String) },
    ]);
    expect(Object.keys(document.paths)).toHaveLength(6);
    const ids = Object.values(document.paths).map(
      (operation) => operationSchema.parse(operation).get.operationId,
    );
    expect(new Set(ids).size).toBe(6);
  });
  it.each(restDocumentation)(
    'matches live local REST output and schemas for $path',
    async (endpoint) => {
      const path = `/api/v1/schleswig/${endpoint.path}`;
      const { get } = operationSchema.parse(document.paths[path]);
      expect(
        Object.keys(
          z.record(z.string(), z.unknown()).parse(document.paths[path]),
        ),
      ).toEqual(['get']);
      const response = await fetch(
        `${base}${path}${endpoint.path === 'water-level' ? '' : '?limit=1'}`,
      );
      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      const media = get.responses['200'].content['application/json'];
      expect(media.examples.sample.value).toEqual(body);
      expect(endpoint.schema.safeParse(body).success).toBe(true);
      expect(media.schema.$ref).toBe(`#/components/schemas/${endpoint.name}`);
      const schema = document.components.schemas[endpoint.name]!;
      expect(schema).toEqual(z.toJSONSchema(endpoint.schema));
      expect(
        (
          await fromJsonSchema(z.record(z.string(), z.unknown()).parse(schema))[
            '~standard'
          ].validate(body)
        ).issues,
      ).toBeUndefined();
      expect(get.parameters.map(({ name }) => name)).toEqual(
        endpoint.path === 'water-level' ? [] : ['id', 'q', 'limit', 'offset'],
      );
      for (const parameter of get.parameters)
        expect(parameter.schema).toEqual(
          z.toJSONSchema(listQuerySchema.shape[parameter.name], {
            io: 'input',
          }),
        );
    },
  );
  it('documents errors without exposing server internals', async () => {
    const schema = document.components.schemas.Error!;
    for (const [path, status, options] of [
      ['/api/v1/schleswig/addresses?limit=101', 400, {}],
      [
        '/api/v1/schleswig/addresses',
        403,
        { headers: { Origin: 'https://foreign.example' } },
      ],
      ['/api/v1/schleswig/absent', 404, {}],
      ['/api/v1/schleswig/addresses', 405, { method: 'POST' }],
    ] as const) {
      const response = await fetch(`${base}${path}`, options);
      expect(response.status).toBe(status);
      expect(
        (
          await fromJsonSchema(z.record(z.string(), z.unknown()).parse(schema))[
            '~standard'
          ].validate(await response.json())
        ).issues,
      ).toBeUndefined();
    }
  });
});
