import { publicError } from '../src/shared/errors.ts';

// Shared MCP result shaping for legacy and theme tools.
export async function toolResult(action: () => Promise<object>) {
  try {
    const result = await action();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      structuredContent: { ...result },
    };
  } catch (error) {
    const body = publicError(error);
    if (body.error.code === 'INTERNAL_ERROR') console.error(error);
    return {
      isError: true,
      content: [{ type: 'text' as const, text: JSON.stringify(body) }],
    };
  }
}
