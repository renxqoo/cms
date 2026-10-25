import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Rule } from '@oxlint/plugins';
import { noCodeComments, privateTests, workspaceBoundaries } from '../index.ts';
import { lintRule } from './rule-harness.ts';

interface Case {
  code: string;
  filename?: string;
  errors?: number | { messageId: string }[];
}
function run(name: string, rule: Rule, cases: { valid: (string | Case)[]; invalid: Case[] }) {
  describe(`Rule ${name}`, () => {
    for (const entry of [...cases.valid, ...cases.invalid]) {
      const sample = typeof entry === 'string' ? { code: entry } : entry;
      it(`checks ${sample.code}`, () => {
        const diagnostics = lintRule(rule, {
          code: sample.code,
          filename: sample.filename ?? '/input.ts',
        });
        const expected = sample.errors;
        expect(diagnostics).toHaveLength(
          Array.isArray(expected) ? expected.length : (expected ?? 0),
        );
      });
    }
  });
}

const root = mkdtempSync(join(tmpdir(), 'cms-rule-tests-'));
writeFileSync(join(root, '.oxlintrc.json'), '{}');
for (const [path, name, exports] of [
  ['apps/api', '@cms/api', { './http': './src/http.ts' }],
  [
    'packages/cms',
    '@cms/core',
    { './content': './src/content/index.ts', '.': './src/index.ts', './wild/*': './src/*.ts' },
  ],
  ['packages/database', '@cms/db', { './client': './src/client.ts' }],
  [
    'packages/conditional',
    '@cms/conditional',
    { types: './src/index.ts', default: './src/index.ts' },
  ],
  ['packages/shared', '@cms/shared', './src/index.ts'],
  ['packages/blocked', '@cms/blocked', { '.': null, './hidden': null }],
] as const) {
  mkdirSync(join(root, path, 'src'), { recursive: true });
  writeFileSync(join(root, path, 'package.json'), JSON.stringify({ name, exports }));
}
mkdirSync(join(root, 'packages/empty'), { recursive: true });
mkdirSync(join(root, 'packages/cms/src/__test__'), { recursive: true });
writeFileSync(
  join(root, 'packages/cms/src/__test__/fixture.ts'),
  'export interface Secret { value: number }',
);
writeFileSync(join(root, 'apps/api/src/local.ts'), 'export const value = 1;');
writeFileSync(
  join(root, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      paths: {
        '@hidden': ['./packages/cms/src/__test__/fixture.ts'],
        '@local': ['./apps/api/src/local.ts'],
      },
    },
    include: ['**/*.ts'],
  }),
);
symlinkSync(join(root, 'packages/cms/src/__test__/fixture.ts'), join(root, 'apps/api/src/link.ts'));
writeFileSync(join(root, 'README.md'), 'documentation');
afterAll(() => rmSync(root, { recursive: true, force: true }));

run('no-code-comments', noCodeComments, {
  valid: [
    'export const url = "https://example.com";',
    'export const text = "/* text */";',
    'export const pattern = /\\/\\//;',
  ],
  invalid: [
    { code: '// explanation\nexport const value = 1;', errors: [{ messageId: 'forbidden' }] },
    { code: 'export const value = /* explanation */ 1;', errors: [{ messageId: 'forbidden' }] },
  ],
});

const source = join(root, 'apps/api/src/route.ts');
run('workspace-boundaries', workspaceBoundaries, {
  valid: [
    { filename: source, code: 'import { publish } from "@cms/core/content"; publish();' },
    { filename: source, code: 'export { create } from "@cms/core";' },
    { filename: source, code: 'import "./local.ts";' },
    { filename: source, code: 'import "hono";' },
    { filename: source, code: 'import "@cms/conditional";' },
    { filename: source, code: 'import "@cms/shared";' },
    { filename: source, code: 'import "@local";' },
    { filename: source, code: 'import "node:fs";' },
    {
      filename: join(root, 'apps/api/src/__test__/use.test.ts'),
      code: 'import "../../../../test/support/database.ts";',
    },
    { filename: join(root, 'tooling/test.ts'), code: 'import "@cms/core/internal";' },
    { filename: source, code: 'export const value = 1;' },
    { filename: join(tmpdir(), 'outside-cms-test.ts'), code: 'import "external";' },
    { filename: source, code: 'export const load = () => import("@cms/core/content");' },
  ],
  invalid: [
    { filename: source, code: 'import "../../../packages/cms/src/content/index.ts";', errors: 1 },
    { filename: source, code: 'export { value } from "@cms/core/src/private.ts";', errors: 1 },
    { filename: source, code: 'export * from "@cms/core/private";', errors: 1 },
    { filename: source, code: 'export const load = () => import("@cms/core/private");', errors: 1 },
    {
      filename: source,
      code: 'export type Private = import("@cms/core/private").Secret;',
      errors: 1,
    },
    { filename: source, code: 'export const load = (path: string) => import(path);', errors: 1 },
    { filename: source, code: 'import "@cms/core/wild/hidden";', errors: 1 },
    { filename: source, code: 'import "@cms/blocked";', errors: 1 },
    { filename: source, code: 'import "@hidden";', errors: 1 },
    { filename: source, code: 'import "./link.ts";', errors: 1 },
    { filename: source, code: 'import "file:///private/module.ts";', errors: 1 },
    { filename: source, code: 'import "../../../tooling/private.ts";', errors: 1 },
    { filename: join(root, 'packages/cms/src/use.ts'), code: 'import "@cms/api/http";', errors: 1 },
    { filename: join(root, 'packages/cms/src/use.ts'), code: 'import "@cms/db";', errors: 1 },
  ],
});

run('private-tests', privateTests, {
  valid: [
    { filename: source, code: 'import "./service.ts";' },
    { filename: join(root, 'a/__test__/a.test.ts'), code: 'import "./fixture.ts";' },
    { filename: join(root, 'a/__test__/nested/a.test.ts'), code: 'import "../fixture.ts";' },
    { filename: source, code: 'import "../../../test/support/database.ts";' },
  ],
  invalid: [
    { filename: source, code: 'import "./__test__/fixture.ts";', errors: 1 },
    {
      filename: join(root, 'a/__test__/a.test.ts'),
      code: 'import "../../b/__test__/fixture.ts";',
      errors: 1,
    },
    { filename: source, code: 'import "@cms/core/__test__/fixture";', errors: 1 },
    { filename: source, code: 'import "@hidden";', errors: 1 },
    { filename: source, code: 'import "./link.ts";', errors: 1 },
    { filename: source, code: 'import "file:///a/__test__/fixture.ts";', errors: 1 },
    { filename: source, code: 'export * from "./__test__/fixture.ts";', errors: 1 },
    {
      filename: source,
      code: 'export type Private = import("./__test__/fixture.ts").Secret;',
      errors: 1,
    },
  ],
});
