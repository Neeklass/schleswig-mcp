// Shared, parser-blocking bootstrap: apply the theme before the stylesheet/body.
// Keep the existing public asset URL so deployment routing stays unchanged.
(() => {
  const modes = ['system', 'light', 'dark'];
  const key = 'schleswig-theme';
  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let mode = 'system';
  let button;
  try {
    const stored = window.localStorage.getItem(key);
    if (modes.includes(stored)) mode = stored;
  } catch {
    /* Theme switching still works when storage is blocked. */
  }

  function effectiveTheme() {
    return mode === 'system' ? (system.matches ? 'dark' : 'light') : mode;
  }

  function applyTheme() {
    const effective = effectiveTheme();
    root.dataset.theme = effective;
    root.dataset.themeMode = mode;
    root.style.colorScheme = effective;
    if (button) {
      const next = modes[(modes.indexOf(mode) + 1) % modes.length];
      const label =
        'Theme: ' +
        mode[0].toUpperCase() +
        mode.slice(1) +
        (mode === 'system' ? ' (' + effective + ')' : '') +
        '. Switch to ' +
        next[0].toUpperCase() +
        next.slice(1) +
        '.';
      button.setAttribute('aria-label', label);
      button.title = label;
    }
    // Scalar's documented theme classes support an explicit host element.
    // Own only our mount; never mutate Scalar's generated DOM or remount it.
    // 1.75.0 reads darkMode/forceDarkModeState only during initialization.
    const reference = document.getElementById('rest-reference');
    reference?.classList.toggle('dark-mode', effective === 'dark');
    reference?.classList.toggle('light-mode', effective === 'light');
  }
  applyTheme();
  system.addEventListener('change', () => {
    if (mode === 'system') applyTheme();
  });
  window.addEventListener('storage', (event) => {
    if (event.key === key || event.key === null) {
      mode = modes.includes(event.newValue) ? event.newValue : 'system';
      applyTheme();
    }
  });
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      button = document.getElementById('theme-control');
      if (button) {
        button.hidden = false;
        button.addEventListener('click', () => {
          mode = modes[(modes.indexOf(mode) + 1) % modes.length];
          try {
            if (mode === 'system') window.localStorage.removeItem(key);
            else window.localStorage.setItem(key, mode);
          } catch {
            /* Keep the in-memory preference usable. */
          }
          applyTheme();
        });
        applyTheme();
      }
      return loadReference();
    },
    { once: true },
  );

  async function loadReference() {
    // Official Scalar ESM integration. Keep this version pinned and API calls same-origin.
    const status = document.getElementById('docs-status');
    const feedback = document.getElementById('docs-feedback');
    // The standalone ESM bundle auto-initializes the legacy #api-reference ID.
    // Use a distinct mount ID so only our configured instance is created.
    const reference = document.getElementById('rest-reference');
    if (!reference) return;
    status.textContent = 'Loading the API reference…';
    reference.setAttribute('aria-busy', 'true');

    function showFailure() {
      feedback.hidden = false;
      status.textContent =
        'The interactive reference could not load. Reload to try again, or use the OpenAPI specification below.';
      reference.setAttribute('aria-busy', 'false');
    }

    // Also covers stalled CDN chunks and asynchronous rendering failures. A late
    // successful load can still recover; no Scalar placeholders are hidden by CSS.
    const timeout = setTimeout(showFailure, 20000);

    try {
      const [{ createApiReference }, content] = await Promise.all([
        import('https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.75.0/esm.js'),
        (async () => {
          // Fetch explicitly so HTTP and JSON failures reach the accessible fallback.
          const response = await fetch('/openapi.json', {
            signal: AbortSignal.timeout(20000),
          });
          if (!response.ok)
            throw new Error('The OpenAPI document is unavailable.');
          const content = await response.json();
          if (
            content?.openapi !== '3.1.0' ||
            !content.paths ||
            Object.keys(content.paths).length === 0
          ) {
            throw new Error('The OpenAPI document is invalid.');
          }
          return content;
        })(),
      ]);
      createApiReference('#rest-reference', {
        content,
        layout: 'modern',
        showSidebar: true,
        withDefaultFonts: false,
        hideDarkModeToggle: true,
        darkMode: effectiveTheme() === 'dark',
        hideClientButton: true,
        showDeveloperTools: 'never',
        agent: { disabled: true },
        telemetry: false,
        customCss: `
      :root {
        --scalar-font: system-ui, sans-serif;
        --scalar-font-code: ui-monospace, SFMono-Regular, Consolas, monospace;
      }
      .light-mode {
        --scalar-color-accent: #013564;
        --scalar-link-color: #013564;
        --scalar-background-1: #ffffff;
      }
      .dark-mode {
        --scalar-color-1: #e4eaf0;
        --scalar-color-2: #b0becb;
        --scalar-color-3: #94a6b7;
        --scalar-color-accent: #a7d2f5;
        --scalar-link-color: #a7d2f5;
        --scalar-background-1: #101c28;
        --scalar-background-2: #172635;
        --scalar-background-3: #243747;
        --scalar-background-accent: #243747;
        --scalar-border-color: #3b4e60;
      }
    `,
        onLoaded() {
          clearTimeout(timeout);
          reference.setAttribute('aria-busy', 'false');
          feedback.hidden = true;
          status.textContent = 'API reference loaded.';
        },
      });
    } catch {
      clearTimeout(timeout);
      showFailure();
    }
  }
})();
