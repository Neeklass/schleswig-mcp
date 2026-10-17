import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { publicError } from '../shared/errors.ts';
import { waterLevelSchema } from '../modules/water-level.ts';
import type { GetWaterLevel } from '../modules/water-level.ts';

export function createWaterLevelMcp(getWaterLevel: GetWaterLevel) {
  return createMcpHandler(() => {
    const server = new McpServer({ name: 'schleswig-mcp', version: '0.1.0' });
    server.registerTool(
      'get_schleswig_water_level',
      {
        title: 'Schleswig water level',
        description:
          'Get the latest available PEGELONLINE water-level measurement for Schleswig, Germany. Includes its timestamp, age, station, source and stale status. The gauge reading is not water depth. Measurements are unvalidated raw data.',
        inputSchema: z.strictObject({}),
        outputSchema: waterLevelSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async () => {
        try {
          const result = await getWaterLevel();
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
            structuredContent: result,
          };
        } catch (error) {
          const failure = publicError(error);
          if (failure.status === 500) console.error(error);
          return {
            isError: true,
            content: [{ type: 'text', text: JSON.stringify(failure.body) }],
          };
        }
      },
    );
    return server;
  });
}
