// Online theme/navigation checks with the same isolated Playwright installation.
/* global document, window, localStorage, getComputedStyle, MutationObserver */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
const require = createRequire(resolve('.scratchpad/scalar-browser/probe.cjs'));
const { chromium } = require('playwright');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE
    ? { executablePath: process.env.BROWSER_EXECUTABLE }
    : { channel: 'msedge' }),
});
const base = 'http://127.0.0.1:3000';
const report = [];
try {
  for (const [size, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({ viewport, colorScheme: 'dark' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    // Observe the first body insertion, before DOMContentLoaded, to catch flashes.
    await page.addInitScript(() => {
      window.firstBodyTheme = null;
      const observer = new MutationObserver(() => {
        if (document.body) {
          window.firstBodyTheme = document.documentElement.dataset.theme;
          observer.disconnect();
        }
      });
      observer.observe(document, { childList: true, subtree: true });
    });
    const theme = page.locator('#theme-control');
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    const state = async (mode, effective) => {
      await page.waitForFunction(
        ({ mode, effective }) =>
          document.documentElement.dataset.themeMode === mode &&
          document.documentElement.dataset.theme === effective,
        { mode, effective },
      );
      assert.match(
        await theme.getAttribute('aria-label'),
        new RegExp(`Theme: ${mode[0].toUpperCase() + mode.slice(1)}`),
      );
    };
    const scalar = async (effective) => {
      await page.waitForFunction(
        () => document.querySelector('#docs-feedback')?.hidden,
      );
      assert.equal(await page.locator('.scalar-api-reference').count(), 1);
      assert.equal(await page.locator('.introduction-skeleton').count(), 0);
      assert.equal(await page.locator('#api-reference').count(), 0);
      assert.equal(
        await page.locator('#rest-reference').getAttribute('class'),
        effective + '-mode',
      );
      const bg = await page
        .locator('.scalar-api-reference')
        .evaluate((el) =>
          getComputedStyle(el).getPropertyValue('--scalar-background-1').trim(),
        );
      assert.equal(bg, effective === 'dark' ? '#101c28' : '#ffffff');
    };
    const shot = async (name) =>
      page.screenshot({
        path: resolve(`.scratchpad/scalar-browser/theme-${size}-${name}.png`),
      });
    await page.goto(base);
    await state('system', 'dark');
    assert.equal(await page.evaluate(() => window.firstBodyTheme), 'dark');
    await theme.focus();
    assert.equal(
      await theme.evaluate((el) => getComputedStyle(el).outlineStyle),
      'solid',
    );
    await theme.press('Enter');
    await state('light', 'light');
    assert.equal(
      await page.evaluate(() => localStorage.getItem('schleswig-theme')),
      'light',
    );
    await theme.press('Space');
    await state('dark', 'dark');
    assert.equal(
      await page.evaluate(() => localStorage.getItem('schleswig-theme')),
      'dark',
    );
    await page.emulateMedia({ colorScheme: 'light' });
    await state('dark', 'dark');

    for (const effective of ['dark', 'light']) {
      for (const [label, path] of [
        ['home', '/'],
        ['mcp', '/mcp-docs'],
        ['docs', '/docs'],
      ]) {
        if (label === 'home') await page.goto(base);
        else
          await nav
            .getByRole('link', {
              name:
                label === 'mcp'
                  ? 'MCP documentation'
                  : 'REST API documentation',
              exact: true,
            })
            .click();
        await page.waitForURL(base + path);
        await state(effective, effective);
        if (label === 'docs') await scalar(effective);
        assert.equal(
          await page.evaluate(() => window.firstBodyTheme),
          effective,
        );
        for (const [name, href, asset] of [
          ['REST API documentation', '/docs', 'rest-api'],
          ['MCP documentation', '/mcp-docs', 'mcp'],
          [
            'GitHub repository',
            'https://github.com/Neeklass/schleswig-mcp',
            'github',
          ],
        ]) {
          const link = nav.getByRole('link', { name, exact: true });
          assert.equal(await link.getAttribute('href'), href);
          assert.equal(await link.getAttribute('title'), name);
          const icon = link.locator('.site-icon[aria-hidden="true"]');
          assert.equal(await icon.count(), 1);
          const style = await icon.evaluate((element) => {
            const css = getComputedStyle(element);
            return {
              mask: css.maskImage,
              color: css.backgroundColor,
              width: css.width,
              height: css.height,
            };
          });
          assert.equal(style.mask, `url("${base}/icons/${asset}.svg")`);
          assert.equal(
            style.color,
            effective === 'dark' ? 'rgb(167, 210, 245)' : 'rgb(1, 53, 100)',
          );
          assert.equal(style.width, asset === 'mcp' ? '26px' : '22px');
          assert.equal(style.height, style.width);
          const rect = await link.boundingBox();
          assert.ok(rect.width >= 44 && rect.height >= 44);
        }
        assert.equal(await nav.getByRole('link').count(), 3);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth),
          viewport.width,
        );
        await shot(`${label}-${effective}`);
        if (label === 'docs') {
          // Keep an identity reference: toggling must not merely replace an instance.
          const root = await page
            .locator('.scalar-api-reference')
            .elementHandle();
          await theme.click();
          if (effective === 'dark') await state('system', 'light');
          else await state('dark', 'dark');
          await scalar(effective === 'dark' ? 'light' : 'dark');
          assert.ok(
            await root.evaluate(
              (el) => el === document.querySelector('.scalar-api-reference'),
            ),
          );
          // Return to the explicit mode for the reload check.
          while (
            (await page.locator('html').getAttribute('data-theme-mode')) !==
            effective
          )
            await theme.click();
          await scalar(effective);
        }
        await page.reload();
        await state(effective, effective);
        assert.equal(
          await page.evaluate(() => window.firstBodyTheme),
          effective,
        );
        report.push({ size, page: path, theme: effective });
      }
      // dark -> system -> light, leaving light explicit for the next loop.
      if (effective === 'dark') {
        await theme.click();
        await theme.click();
      }
    }
    // Existing operation hash and mounted reference survive all mode changes.
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
    await page.waitForTimeout(500);
    const hash = page.url();
    // Avoid scrolling to the header: Scalar's normal scrollspy changes the hash
    // when the introduction scrolls into view, independently of theme changes.
    await theme.evaluate((element) => element.focus({ preventScroll: true }));
    await page.keyboard.press('Enter');
    assert.equal(page.url(), hash);
    await page.keyboard.press('Enter'); // System (OS light)
    await state('system', 'light');
    assert.equal(
      await page.evaluate(() => localStorage.getItem('schleswig-theme')),
      null,
    );
    await page.emulateMedia({ colorScheme: 'dark' });
    await state('system', 'dark');
    await scalar('dark');
    await page
      .getByRole('button', {
        name: 'Test Request (get /api/v1/schleswig/addresses)',
        exact: true,
      })
      .click();
    const dialog = page.getByRole('dialog', { name: 'API Client' });
    await dialog.waitFor();
    for (const effective of ['dark', 'light', 'dark']) {
      await page.emulateMedia({ colorScheme: effective });
      await state('system', effective);
      await scalar(effective);
      assert.equal(
        await dialog.evaluate((el) =>
          getComputedStyle(el).getPropertyValue('--scalar-background-1').trim(),
        ),
        effective === 'dark' ? '#101c28' : '#ffffff',
      );
      await shot(`open-dialog-${effective}`);
    }
    await dialog
      .getByRole('button', { name: 'Close Client', exact: true })
      .click();
    // GitHub link navigation is checked without depending on GitHub availability.
    await page.route('https://github.com/Neeklass/schleswig-mcp', (r) =>
      r.fulfill({ status: 200, body: 'Repository navigation verified' }),
    );
    await nav
      .getByRole('link', { name: 'GitHub repository', exact: true })
      .click();
    assert.equal(page.url(), 'https://github.com/Neeklass/schleswig-mcp');
    assert.deepEqual(errors, []);
    await context.close();

    const blocked = await browser.newContext({ viewport, colorScheme: 'dark' });
    await blocked.addInitScript(() =>
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('Storage blocked for test');
        },
      }),
    );
    const fallback = await blocked.newPage();
    await fallback.goto(base);
    await fallback.locator('#theme-control').click();
    assert.equal(
      await fallback.locator('html').getAttribute('data-theme'),
      'light',
    );
    await fallback.locator('#theme-control').click();
    assert.equal(
      await fallback.locator('html').getAttribute('data-theme'),
      'dark',
    );
    await blocked.close();
  }
  console.log(
    'Theme browser checks passed: both sizes, all pages, both themes, persistence, system changes, keyboard, blocked storage and single Scalar instance.',
  );
} finally {
  await writeFile(
    '.scratchpad/scalar-browser/theme-report.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  await browser.close();
}
