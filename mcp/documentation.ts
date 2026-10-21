import { readFile } from 'node:fs/promises';
import { themeTools } from './themes.ts';

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
  const themes = Object.values(themeTools)
    .map(({ name, datasets }) => {
      const [dataset] = datasets;
      const example = examples[legacyToolName(dataset)];
      if (!example)
        throw new Error(`Missing documentation example for ${name}.`);
      const result = { dataset, result: example.result };
      return `<section aria-labelledby="${name}">
  <h3 id="${name}"><code>${name}</code></h3>
  <p>Datasets: ${datasets.map((item) => `<code>${item}</code>`).join(', ')}.</p>
  <p>Input: <code>${escapeHtml(JSON.stringify(themeExampleArguments(name)))}</code>.</p>
  <details><summary>Example structuredContent</summary>
    <pre data-tool="${name}"><code>${escapeHtml(JSON.stringify(result, null, 2))}</code></pre>
  </details>
</section>`;
    })
    .join('\n');
  return template
    .replace('<!-- THEME_TOOL_REFERENCE -->', themes)
    .replace('<!-- TOOL_REFERENCE -->', reference);
}

// Maps a dataset name (also its REST route) to its deprecated single tool.
function legacyToolName(dataset: string) {
  const suffix = dataset.replaceAll('-', '_');
  return `${suffix === 'water_level' ? 'get' : 'list'}_schleswig_${suffix}`;
}

// Arguments of the documented example call for any tool name.
export function themeExampleArguments(name: string): Record<string, unknown> {
  const theme = Object.values(themeTools).find((item) => item.name === name);
  if (!theme) return name.startsWith('get_') ? {} : { limit: 1 };
  const [dataset] = theme.datasets;
  return dataset === 'water-level' ? { dataset } : { dataset, limit: 1 };
}
