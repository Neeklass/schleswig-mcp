// Optional online smoke test. Playwright stays outside application dependencies.
/* global document, window */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(resolve('.scratchpad/scalar-browser/probe.cjs'));
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:3000';
const evidence = resolve('.scratchpad/scalar-browser');
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE
    ? { executablePath: process.env.BROWSER_EXECUTABLE }
    : { channel: 'msedge' }),
});
const report = { pages: [], endpoints: [], requests: [], events: [] };

try {
  for (const [size, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
    for (const colorScheme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport, colorScheme });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      page.on('pageerror', (error) =>
        report.events.push({ type: 'pageerror', text: error.message }),
      );
      page.on('console', (message) => {
        if (['warning', 'error'].includes(message.type()))
          report.events.push({
            type: message.type(),
            text: message.text(),
            location: message.location(),
          });
      });
      page.on('requestfailed', (request) =>
        report.events.push({
          type: 'failed',
          url: request.url(),
          error: request.failure(),
        }),
      );
      page.on('response', (response) =>
        report.events.push({
          type: 'response',
          url: response.url(),
          status: response.status(),
        }),
      );
      const screenshot = (name) =>
        page.screenshot({
          path: resolve(evidence, `after-${size}-${colorScheme}-${name}.png`),
          animations: 'disabled',
        });
      const noOverflow = async () => {
        const dimensions = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
        }));
        assert.ok(
          dimensions.width <= dimensions.viewport,
          JSON.stringify(dimensions),
        );
      };
      const loaded = async () => {
        await page.waitForFunction(
          () => document.querySelector('#docs-feedback')?.hidden,
          undefined,
          { timeout: 30000 },
        );
        assert.equal(
          await page.locator('.scalar-api-reference').count(),
          1,
          'Exactly one Scalar instance must mount',
        );
        assert.equal(
          await page.locator('.introduction-skeleton').count(),
          0,
          'Loading skeletons must resolve',
        );
        assert.equal(
          await page.locator('#rest-reference').getAttribute('aria-busy'),
          'false',
        );
        assert.equal(
          await page.locator('html').getAttribute('data-theme'),
          colorScheme,
        );
        assert.ok(
          (
            await page.locator('#rest-reference').getAttribute('class')
          ).includes(`${colorScheme}-mode`),
        );
      };
      for (const [label, path] of [
        ['home', '/'],
        ['docs', '/docs'],
        ['hash', '/docs#description/introduction'],
        ['mcp', '/mcp-docs'],
        ['openapi', '/openapi.json'],
      ]) {
        // A hash-only goto otherwise reuses the current document and returns null.
        await page.goto('about:blank');
        const response = await page.goto(`${base}${path}`);
        assert.equal(response.status(), 200);
        if (path.startsWith('/docs')) {
          await loaded();
          const root = await page
            .locator('.scalar-api-reference')
            .boundingBox();
          const intro = await page
            .getByRole('region', { name: 'Introduction', exact: true })
            .boundingBox();
          assert.ok(
            intro.y >= root.y && intro.y - root.y < 100,
            'Introduction starts in the mount, without a preceding empty reference',
          );
          if (size === 'desktop') {
            const sidebar = await page.getByRole('complementary').boundingBox();
            assert.equal(sidebar.x, 0);
            assert.ok(sidebar.width > 200 && sidebar.width < 350);
            assert.ok(intro.x >= sidebar.width);
          }
        }
        if (label === 'openapi')
          assert.equal(Object.keys((await response.json()).paths).length, 6);
        else
          assert.equal(
            await page
              .getByRole('navigation', { name: 'Main navigation' })
              .getByRole('link', { name: 'GitHub repository', exact: true })
              .getAttribute('href'),
            'https://github.com/Neeklass/schleswig-mcp',
          );
        await noOverflow();
        await screenshot(label);
        report.pages.push({
          size,
          colorScheme,
          path,
          status: response.status(),
        });
      }

      // Ensure the compiled server really serves the edited source assets.
      for (const file of [
        'docs.js',
        'styles.css',
        'openapi.json',
        'icons/rest-api.svg',
        'icons/mcp.svg',
        'icons/github.svg',
      ]) {
        const response = await context.request.get(`${base}/${file}`);
        assert.equal(response.status(), 200);
        if (file.endsWith('.svg'))
          assert.equal(
            response.headers()['content-type'],
            'image/svg+xml; charset=utf-8',
          );
        assert.equal(
          await response.text(),
          await readFile(new URL(`../public/${file}`, import.meta.url), 'utf8'),
        );
      }
      await page.goto(`${base}/docs`);
      await loaded();
      const spec = await (
        await context.request.get(`${base}/openapi.json`)
      ).json();
      for (const [path, { get }] of Object.entries(spec.paths)) {
        if (size === 'mobile') {
          await page
            .getByRole('button', { name: 'Open Menu', exact: true })
            .click();
          if (path.endsWith('water-level')) await screenshot('menu');
        }
        await page
          .getByRole('link', {
            name: `${get.summary} HTTP Method: GET`,
            exact: true,
          })
          .click();
        await page.waitForURL(`${base}/docs#GET${path}`);
        // Let Scalar's deferred hash scroll finish before expanding a schema;
        // otherwise that scroll can race the following screenshot's scroll.
        await page.waitForTimeout(500);
        const section = page.getByRole('region', {
          name: get.summary,
          exact: true,
        });
        await section
          .getByRole('heading', { name: get.summary, exact: true })
          .waitFor();
        // Mobile navigation closes the menu and scrolls after Vue's next render.
        await page.waitForFunction(
          (element) => {
            const bounds = element.getBoundingClientRect();
            return bounds.y >= 0 && bounds.y < window.innerHeight;
          },
          await section
            .getByRole('heading', { name: get.summary, exact: true })
            .elementHandle(),
        );
        const query = section.getByRole('list', {
          name: 'Query Parameters',
          exact: true,
        });
        if (path.endsWith('water-level')) assert.equal(await query.count(), 0);
        else {
          const parameters = await query.innerText();
          for (const key of ['id', 'q', 'limit', 'offset'])
            assert.match(parameters, new RegExp(`\\b${key}\\b`));
          assert.match(parameters, /max:\s+100/);
        }
        await screenshot(path.split('/').at(-1));
        await section
          .getByRole('list', { name: 'Responses', exact: true })
          .getByRole('button', { name: /^200 / })
          .click();
        const schemaName = get.responses['200'].content[
          'application/json'
        ].schema.$ref
          .split('/')
          .at(-1);
        await section
          .getByRole('button', { name: schemaName, exact: true })
          .waitFor();
        const field = section.getByRole('button', {
          name: path.endsWith('water-level') ? 'measurement' : 'data',
          exact: true,
        });
        await field.click();
        const schemaText = await section.innerText();
        for (const property of Object.keys(
          spec.components.schemas[schemaName].properties,
        ))
          assert.ok(schemaText.includes(property), `${schemaName}.${property}`);
        await field.scrollIntoViewIfNeeded();
        // Wait for lazy rendering and scrolling to settle before visual capture.
        await field.click({ trial: true });
        await screenshot(`${path.split('/').at(-1)}-schema`);
        await noOverflow();
        report.endpoints.push({ size, colorScheme, path, schemaName });
      }

      if (size === 'mobile')
        await page
          .getByRole('button', { name: 'Open Menu', exact: true })
          .click();
      await page
        .getByRole('link', {
          name: 'List addresses HTTP Method: GET',
          exact: true,
        })
        .click();
      await page
        .getByRole('button', {
          name: 'Test Request (get /api/v1/schleswig/addresses)',
          exact: true,
        })
        .click();
      const dialog = page.getByRole('dialog', { name: 'API Client' });
      await dialog.waitFor();
      await dialog
        .getByRole('checkbox', {
          name: 'Include offset in request',
          exact: true,
        })
        .uncheck();
      for (const limit of [1, 101]) {
        const row = dialog.getByRole('row').filter({
          has: page.getByRole('checkbox', {
            name: 'Include limit in request',
            exact: true,
          }),
        });
        await row
          .getByRole('combobox', { name: 'Value', exact: true })
          .fill(String(limit));
        const pending = page.waitForResponse((response) =>
          response.url().includes('/api/v1/schleswig/addresses?'),
        );
        await dialog
          .getByRole('button', { name: /^Send get request to/ })
          .click();
        const response = await pending;
        const body = await response.json();
        assert.equal(
          response.url(),
          `${base}/api/v1/schleswig/addresses?limit=${limit}`,
        );
        assert.equal(response.status(), limit === 1 ? 200 : 400);
        if (limit === 1) {
          assert.deepEqual(Object.keys(body).sort(), [
            'data',
            'metadata',
            'notices',
            'pagination',
          ]);
          assert.equal(body.data.length, 1);
          assert.deepEqual(body.pagination, {
            offset: 0,
            limit: 1,
            total: body.metadata.recordCount,
            returned: 1,
            nextOffset: 1,
          });
        } else assert.equal(body.error.code, 'BAD_REQUEST');
        const responsePanel = dialog.getByRole('region', {
          name: 'Response',
          exact: true,
        });
        await responsePanel
          .getByText(limit === 1 ? '200 OK' : '400 Bad Request', {
            exact: true,
          })
          .waitFor();
        // The status arrives before the response editor finishes updating.
        await page.waitForFunction(
          ({ element, text }) =>
            element.querySelector('.cm-content')?.textContent.includes(text),
          {
            element: await responsePanel.elementHandle(),
            text: limit === 1 ? 'metadata' : 'BAD_REQUEST',
          },
        );
        // On mobile the response body is below the query controls; bring the
        // actual editor into view rather than capturing the reference behind it.
        await responsePanel.locator('.cm-content').scrollIntoViewIfNeeded();
        await screenshot(`request-${limit}`);
        await noOverflow();
        report.requests.push({
          size,
          colorScheme,
          url: response.url(),
          status: response.status(),
          body,
        });
      }
      await context.close();
    }
  }
  assert.equal(
    report.events.filter((event) =>
      ['pageerror', 'warning', 'failed'].includes(event.type),
    ).length,
    0,
  );
  // A rejected limit intentionally produces an HTTP 400 console message.
  // Browsers may also request an unpublished favicon. Neither is an uncaught error.
  const failedAssets = report.events.filter(
    (event) =>
      event.type === 'response' &&
      event.status >= 400 &&
      !event.url.includes('limit=101') &&
      !event.url.endsWith('/favicon.ico'),
  );
  assert.deepEqual(failedAssets, []);
  assert.deepEqual(
    report.events.filter(
      (event) =>
        event.type === 'error' &&
        !event.location.url.includes('limit=101') &&
        !event.location.url.endsWith('/favicon.ico'),
    ),
    [],
  );
  console.log(
    `Browser smoke passed: ${report.pages.length} pages, ${report.endpoints.length} endpoint/schema checks, ${report.requests.length} Scalar requests.`,
  );
} finally {
  await writeFile(
    resolve(evidence, 'browser-report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await browser.close();
}
