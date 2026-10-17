import { writeFile } from 'node:fs/promises';
import { createOpenApi } from '../api/_lib/openapi.ts';
import { renderMcpDocumentation } from '../mcp/documentation.ts';

const document = await createOpenApi();
await writeFile(
  new URL('../public/openapi.json', import.meta.url),
  JSON.stringify(document, null, 2) + '\n',
);
const examples = Object.fromEntries(
  Object.entries(document.paths).map(([path, { get }]) => {
    const suffix = path.split('/').at(-1).replaceAll('-', '_');
    const name = `${suffix === 'water_level' ? 'get' : 'list'}_schleswig_${suffix}`;
    return [
      name,
      {
        description: get.description.split('\n\n')[0],
        result:
          get.responses['200'].content['application/json'].examples.sample
            .value,
      },
    ];
  }),
);
await writeFile(
  new URL('../public/mcp-docs.html', import.meta.url),
  await renderMcpDocumentation(examples),
);
console.log(
  'Generated OpenAPI and MCP documentation from domain schemas and bounded examples.',
);
