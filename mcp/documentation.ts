import { readFile } from 'node:fs/promises';

// Documentation generation only; registration and request handling stay in mcp.ts.
const toolNames = [
  'get_schleswig_water_level',
  'list_schleswig_addresses',
  'list_schleswig_monuments',
  'list_schleswig_bathing_waters',
  'list_schleswig_charging_stations',
  'list_schleswig_population_forecast',
] as const;

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function renderMcpDocumentation(
  examples: Record<string, { description: string; result: unknown }>,
) {
  const template = await readFile(
    new URL('./documentation.html', import.meta.url),
    'utf8',
  );
  const reference = toolNames
    .map((name) => {
      const example = examples[name];
      if (!example)
        throw new Error(`Missing documentation example for ${name}.`);
      return `<section aria-labelledby="${name}">
  <h3 id="${name}"><code>${name}</code></h3>
  <p>${escapeHtml(example.description)}</p>
  <p>Input: <code>${name.startsWith('get_') ? '{}' : '{"limit": 1}'}</code>.</p>
  <details><summary>Example structuredContent</summary>
    <pre data-tool="${name}"><code>${escapeHtml(JSON.stringify(example.result, null, 2))}</code></pre>
  </details>
</section>`;
    })
    .join('\n');
  return template.replace('<!-- TOOL_REFERENCE -->', reference);
}
