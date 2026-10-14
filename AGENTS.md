# Working on Schleswig MCP

- Write code, comments, documentation,
  and commit messages in English.
- Discuss substantial changes and work in small steps. Follow the scope explicitly
  approved in the conversation; report changes and verification results afterward.
- Never commit, push, publish, or choose a source-code license without permission.
- Prioritize correctness, simplicity, maintainability, type safety, and testability.
- Use strict TypeScript, native ES modules, npm, native fetch, Zod, the official
  MCP TypeScript SDK, and Vitest. Verify compatible stable versions before upgrades.
- Keep HTTP and MCP adapters thin. Both call the same water-level service.
- Validate external data at the boundary. Distinguish unavailable, invalid, missing,
  and stale measurements. A gauge reading is not water depth.
- Use PEGELONLINE only. Keep source-code licensing separate from data licensing.
- Avoid speculative abstractions, additional infrastructure, and unrelated changes.
- Run `npm run check` for implementation changes. Automated tests must not depend
  on the live upstream service. Verify live integration separately when relevant.
- Update the README and relevant documents when behavior or setup changes.
