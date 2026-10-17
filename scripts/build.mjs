import { cp, lstat, mkdir, realpath, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const output = resolve(root, 'dist');
const existing = await lstat(output).catch((error) => {
  if (error.code === 'ENOENT') return undefined;
  throw error;
});
if (
  dirname(output) !== root ||
  existing?.isSymbolicLink() ||
  (existing && (await realpath(output)) !== output)
)
  throw new Error(
    'Refusing to clean a build directory outside the repository.',
  );
await rm(output, { recursive: true, force: true });
const compiler = spawnSync(
  process.execPath,
  [
    resolve(root, 'node_modules/typescript/bin/tsc'),
    '-p',
    'tsconfig.build.json',
  ],
  { cwd: root, stdio: 'inherit' },
);
if (compiler.error) throw compiler.error;
if (compiler.status !== 0) process.exit(compiler.status ?? 1);
await mkdir(resolve(output, 'data'), { recursive: true });
await cp(resolve(root, 'data/curated'), resolve(output, 'data/curated'), {
  recursive: true,
});
console.log('Built api/, mcp/ and src/; copied prepared Gold data.');
