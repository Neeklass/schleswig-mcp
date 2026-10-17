// Scalar is the only interactive documentation dependency; API calls stay same-origin.
try {
  const { createApiReference } =
    await import('https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.75.0/esm.js');
  createApiReference('#api-reference', {
    url: '/openapi.json',
    withDefaultFonts: false,
    hideDarkModeToggle: true,
    forceDarkModeState: 'light',
    hideClientButton: true,
    telemetry: false,
    customCss:
      ':root { --scalar-font: system-ui, sans-serif; --scalar-font-code: ui-monospace, monospace; }',
  });
  document.getElementById('docs-status').hidden = true;
} catch {
  document.getElementById('docs-status').textContent =
    'The interactive reference could not load. Please use the OpenAPI document linked above.';
}
