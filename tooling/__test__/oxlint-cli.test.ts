import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, expect, it } from 'vitest';

const root = mkdtempSync(join(tmpdir(), 'cms-oxlint-cli-'));
const project = resolve(import.meta.dirname, '../..');
symlinkSync(join(project, 'node_modules'), join(root, 'node_modules'), 'dir');
const configuration: unknown = JSON.parse(readFileSync(join(project, '.oxlintrc.json'), 'utf8'));
if (typeof configuration !== 'object' || configuration === null)
  throw new Error('Invalid lint configuration.');
writeFileSync(
  join(root, '.oxlintrc.json'),
  JSON.stringify({
    ...configuration,
    jsPlugins: [join(project, 'tooling/oxlint-plugin/index.ts')],
  }),
);
writeFileSync(
  join(root, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      target: 'ES2023',
      module: 'ESNext',
      moduleResolution: 'Bundler',
    },
    include: ['**/*.ts'],
  }),
);
for (const [directory, name, exports] of [
  ['apps/api', '@cms/api', {}],
  ['packages/cms', '@cms/core', { './content': './src/content.ts' }],
] as const) {
  mkdirSync(join(root, directory), { recursive: true });
  writeFileSync(join(root, directory, 'package.json'), JSON.stringify({ name, exports }));
}
afterAll(() => rmSync(root, { recursive: true, force: true }));

function lint(code: string, path = 'apps/api/src/input.ts') {
  const filename = join(root, path);
  mkdirSync(dirname(filename), { recursive: true });
  writeFileSync(filename, code);
  const result = spawnSync(
    process.execPath,
    [
      join(project, 'node_modules/oxlint/bin/oxlint'),
      '--disable-nested-config',
      '--type-aware',
      '--deny-warnings',
      '--config',
      join(root, '.oxlintrc.json'),
      filename,
    ],
    { cwd: root, encoding: 'utf8' },
  );
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
}

it('loads the real plugin and accepts a legal production module', () => {
  const result = lint('export function greet(name: string): string { return name.trim(); }');
  expect(result.status, result.output).toBe(0);
});

it('accepts an executable Vitest test with resolved dependencies', () => {
  const result = lint(
    'import { test, expect } from "vitest"; test("case", () => { expect(1).toBe(1); });',
    'tooling/__test__/valid.test.ts',
  );
  expect(result.status, result.output).toBe(0);
});

it.each([
  ['export const value = JSON.parse("1");', 'no-unsafe-assignment'],
  ['Promise.resolve(1);', 'no-floating-promises'],
  ['export const value = Bun.version;', 'no-restricted-globals'],
  ['import { test } from "bun:test"; test("case", () => {});', 'no-restricted-imports'],
  ['// explanation\nexport const value = 1;', 'no-code-comments'],
  ['import "@cms/core/private";', 'workspace-boundaries'],
  ['import "./__test__/fixture.ts";', 'private-tests'],
])('rejects production violation %s', (code, diagnostic) => {
  const result = lint(code);
  expect(result.status, result.output).toBe(1);
  expect(result.output).toContain(diagnostic);
});

it.each(['skip', 'only', 'todo'])('rejects Vitest %s', (modifier) => {
  const result = lint(
    `import { test } from "vitest"; test.${modifier}("case", () => {});`,
    `tooling/__test__/${modifier}.test.ts`,
  );
  expect(result.status, result.output).toBe(1);
  expect(result.output).toMatch(/no-(?:disabled|focused)-tests|warn-todo/);
});

it.each(['skipIf(true)', 'runIf(false)'])('rejects conditional test modifier %s', (modifier) => {
  const result = lint(
    `import { test, expect } from "vitest"; test.${modifier}("case", () => { expect(1).toBe(2); });`,
    'tooling/__test__/conditional.test.ts',
  );
  expect(result.status, result.output).toBe(1);
  expect(result.output).toContain('no-restricted-properties');
});

it.each(['relative', 'file', 'alias'])('rejects a resolved boundary bypass: %s', (mode) => {
  const targets: Record<string, string> = {
    relative: 'tooling/secret.ts',
    file: 'packages/cms/src/private.ts',
    alias: 'packages/cms/src/__test__/fixture.ts',
  };
  const target = join(root, targets[mode] ?? 'invalid.ts');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, 'export const secret = 1;');
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2023',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        paths: { '@hidden': ['./packages/cms/src/__test__/fixture.ts'] },
      },
      include: ['**/*.ts'],
    }),
  );
  const specifiers: Record<string, string> = {
    relative: '../../../tooling/secret.ts',
    file: pathToFileURL(target).href,
    alias: '@hidden',
  };
  const result = lint(`export { secret } from "${specifiers[mode]}";`);
  expect(result.status, result.output).toBe(1);
  expect(result.output).toMatch(/workspace-boundaries|private-tests/);
});

it('rejects a public package name redirected by paths into an application', () => {
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2023',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        paths: { '@cms/core/content': ['./apps/api/src/private.ts'] },
      },
      include: ['**/*.ts'],
    }),
  );
  writeFileSync(join(root, 'apps/api/src/private.ts'), 'export const secret = 1;');
  const result = lint('export { secret } from "@cms/core/content";', 'packages/cms/src/aliased.ts');
  expect(result.status, result.output).toBe(1);
  expect(result.output).toContain('workspace-boundaries');
});
