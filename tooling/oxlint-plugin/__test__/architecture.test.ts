import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, expect, it } from 'vitest';
import { architectureBoundaries } from '../index.ts';
import { lintRule } from './rule-harness.ts';

it.each([
  ['apps/api/src/http/roles.ts', 'import type { Database } from "@new-cms/database/client";'],
  ['apps/admin/src/forbidden.tsx', 'import type { AccessApi } from "@new-cms/cms/access";'],
  [
    'apps/admin/src/forbidden.tsx',
    'import { database } from "../../../packages/database/src/client.ts";',
  ],
  ['packages/ui/src/forbidden.tsx', 'import Link from "next/link";'],
  ['packages/ui/src/forbidden.tsx', 'import type { AccessApi } from "@new-cms/cms/access";'],
  ['packages/ui/src/forbidden.tsx', 'export { database } from "../../database/src/client.ts";'],
  ['apps/api/src/http/roles.ts', 'export { createAccess } from "@new-cms/cms/access/composition";'],
  ['apps/api/src/http/roles.ts', 'import("@new-cms/cms/platform/idempotency");'],
  ['apps/api/src/http/content.ts', 'import("@new-cms/cms/content/generate");'],
  [
    'packages/cms/src/assets/references.ts',
    'import type { ContentApi } from "@new-cms/cms/content";',
  ],
  ['packages/cms/src/access/roles.ts', 'import type { ContentApi } from "@new-cms/cms/content";'],
  [
    'packages/cms/src/content/documents/create.ts',
    'import { assets } from "@new-cms/database/schema/assets";',
  ],
  ['packages/cms/src/identity/login.ts', 'import { accessOperations } from "@new-cms/cms/access";'],
  [
    'packages/cms/src/platform/rate-limits.ts',
    'import { identityOperations } from "@new-cms/cms/identity";',
  ],
  [
    'packages/database/src/client.ts',
    'import { identityOperations } from "@new-cms/cms/identity";',
  ],
  ['packages/cms/src/access/admins.ts', 'import { secret } from "../identity/private.ts";'],
  [
    'packages/cms/src/identity/login.ts',
    'import { roles } from "@new-cms/database/schema/access";',
  ],
])('blocks forbidden dependency from %s', (file, code) => {
  expect(lintRule(architectureBoundaries, { filename: `/workspace/${file}`, code })).toHaveLength(
    1,
  );
});

it.each([
  ['apps/api/src/http/roles.ts', 'import type { AccessApi } from "@new-cms/cms/access";'],
  ['apps/admin/src/valid.tsx', 'import Link from "next/link";'],
  ['apps/admin/src/valid.tsx', 'import { Button } from "@new-cms/ui/actions";'],
  ['packages/ui/src/valid.tsx', 'import { Dialog } from "@base-ui/react/dialog";'],
  [
    'packages/cms/src/content/documents/create.ts',
    'import type { AssetsParticipants } from "@new-cms/cms/assets/composition";',
  ],
  [
    'packages/cms/src/content/adapters/postgres/read.ts',
    'import { tables } from "@new-cms/database/schema/generated/content";',
  ],
  [
    'packages/cms/src/content/jobs/run.ts',
    'import { jobs } from "@new-cms/database/schema/content-work";',
  ],
  [
    'packages/cms/src/content/collaboration/leases.ts',
    'import { leases } from "@new-cms/database/schema/content-admin";',
  ],
  ['apps/api/src/http/roles.ts', 'import { CmsError } from "@new-cms/cms/platform/contracts";'],
  [
    'apps/api/src/bootstrap/runtime.ts',
    'import { createAccess } from "@new-cms/cms/access/composition";',
  ],
  [
    'packages/cms/src/access/admins.ts',
    'import type { IdentityParticipants } from "@new-cms/cms/identity/composition";',
  ],
  [
    'packages/cms/src/identity/adapters/postgres/accounts.ts',
    'import { admins } from "@new-cms/database/schema/identity";',
  ],
])('allows declared dependency from %s', (file, code) => {
  expect(lintRule(architectureBoundaries, { filename: `/workspace/${file}`, code })).toHaveLength(
    0,
  );
});

const modulePolicies = [
  { owner: 'identity', allowed: ['identity', 'audit', 'platform'] },
  { owner: 'access', allowed: ['access', 'identity', 'audit', 'platform'] },
  { owner: 'content', allowed: ['content', 'assets', 'access', 'audit', 'platform'] },
  { owner: 'assets', allowed: ['assets', 'access', 'audit', 'platform'] },
  { owner: 'audit', allowed: ['audit', 'platform'] },
  { owner: 'platform', allowed: ['platform'] },
];
const modules = ['identity', 'access', 'content', 'assets', 'audit', 'platform'];
const directions = modulePolicies.flatMap(({ owner, allowed }) =>
  modules.map((target) => ({
    owner,
    target,
    diagnostics: allowed.includes(target) ? 0 : 1,
  })),
);

it.each(directions)(
  'enforces the declared $owner → $target dependency',
  ({ owner, target, diagnostics }) => {
    const entry = target === 'platform' ? 'platform/contracts' : target;
    const code = `export type { Capability } from "@new-cms/cms/${entry}";`;
    expect(
      lintRule(architectureBoundaries, {
        filename: `/workspace/packages/cms/src/${owner}/entry.ts`,
        code,
      }),
    ).toHaveLength(diagnostics);
  },
);

it.each(modules)('database cannot reverse-depend on the %s CMS module', (target) => {
  const entry = target === 'platform' ? 'platform/contracts' : target;
  expect(
    lintRule(architectureBoundaries, {
      filename: '/workspace/packages/database/src/client.ts',
      code: `export type { Capability } from "@new-cms/cms/${entry}";`,
    }),
  ).toHaveLength(1);
});

it.each(modules)('allows the declared %s → database dependency', (owner) => {
  expect(
    lintRule(architectureBoundaries, {
      filename: `/workspace/packages/cms/src/${owner}/entry.ts`,
      code: 'export type { Database } from "@new-cms/database/client";',
    }),
  ).toHaveLength(0);
});

it.each(modules)('allows the declared %s → platform SQL capability dependency', (owner) => {
  expect(
    lintRule(architectureBoundaries, {
      filename: `/workspace/packages/cms/src/${owner}/entry.ts`,
      code: 'export { withIdempotency } from "@new-cms/cms/platform/idempotency";',
    }),
  ).toHaveLength(0);
});

const cliRoot = mkdtempSync(join(tmpdir(), 'cms-architecture-cli-'));
const project = resolve(import.meta.dirname, '../../..');
const configuration: unknown = JSON.parse(readFileSync(join(project, '.oxlintrc.json'), 'utf8'));
if (typeof configuration !== 'object' || configuration === null)
  throw new Error('Invalid lint configuration');
writeFileSync(
  join(cliRoot, '.oxlintrc.json'),
  JSON.stringify({
    ...configuration,
    jsPlugins: [join(project, 'tooling/oxlint-plugin/index.ts')],
  }),
);
function writeConfiguration(file: string) {
  const paths: Record<string, string[]> = {
    '@http-contract': ['./apps/api/src/http/contract.ts'],
    '@audit-access': ['./packages/cms/src/access/index.ts'],
  };
  if (file.endsWith('/masquerade.ts'))
    paths['@new-cms/cms/identity'] = ['./packages/cms/src/access/index.ts'];
  if (file.endsWith('/contracts-alias.ts'))
    paths['@new-cms/cms/platform/contracts'] = ['./packages/cms/src/access/index.ts'];
  writeFileSync(
    join(cliRoot, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2023',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        paths,
      },
      include: ['**/*.ts'],
    }),
  );
}

function fixtureFile(path: string, source: string) {
  const filename = join(cliRoot, path);
  mkdirSync(dirname(filename), { recursive: true });
  writeFileSync(filename, source);
  return filename;
}

const cmsExports = Object.fromEntries(
  modules.flatMap((owner) => [
    [`./${owner}`, `./src/${owner}/index.ts`],
    [`./${owner}/composition`, `./src/${owner}/composition.ts`],
  ]),
);
cmsExports['./platform/contracts'] = './src/platform/contracts.ts';
fixtureFile(
  'packages/cms/package.json',
  JSON.stringify({ name: '@new-cms/cms', exports: cmsExports }),
);
fixtureFile('apps/api/package.json', JSON.stringify({ name: '@new-cms/api' }));
fixtureFile(
  'packages/database/package.json',
  JSON.stringify({ name: '@new-cms/database', exports: { './client': './src/client.ts' } }),
);
for (const owner of modules) {
  fixtureFile(`packages/cms/src/${owner}/index.ts`, 'export const capability = 1;');
  fixtureFile(
    `packages/cms/src/${owner}/composition.ts`,
    'export interface Capability { value: string }',
  );
}
fixtureFile(
  'packages/cms/src/platform/contracts.ts',
  'export interface Capability { value: string }',
);
fixtureFile('packages/database/src/client.ts', 'export interface Database { value: string }');
fixtureFile('apps/api/src/http/contract.ts', 'export const capability = 1;');
fixtureFile('apps/api/src/adapters/helper.ts', 'export const capability = 1;');
fixtureFile(
  'packages/cms/src/identity/adapters/postgres/helper.ts',
  'export const capability = 1;',
);
mkdirSync(join(cliRoot, 'node_modules/@new-cms'), { recursive: true });
for (const entry of readdirSync(join(project, 'node_modules'))) {
  if (entry !== '@new-cms')
    symlinkSync(join(project, 'node_modules', entry), join(cliRoot, 'node_modules', entry), 'dir');
}
symlinkSync(join(cliRoot, 'packages/cms'), join(cliRoot, 'node_modules/@new-cms/cms'), 'dir');
symlinkSync(
  join(cliRoot, 'packages/database'),
  join(cliRoot, 'node_modules/@new-cms/database'),
  'dir',
);
afterAll(() => rmSync(cliRoot, { recursive: true, force: true }));

function cli(file: string, code: string) {
  writeConfiguration(file);
  const filename = fixtureFile(file, code);
  const result = spawnSync(
    process.execPath,
    [
      join(project, 'node_modules/oxlint/bin/oxlint'),
      '--disable-nested-config',
      '--type-aware',
      '--deny-warnings',
      '--config',
      join(cliRoot, '.oxlintrc.json'),
      filename,
    ],
    { cwd: cliRoot, encoding: 'utf8' },
  );
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
}

it.each([
  ['packages/cms/src/audit/forbidden.ts', 'export { capability } from "@new-cms/cms/access";'],
  ['packages/cms/src/audit/alias.ts', 'export { capability } from "@audit-access";'],
  [
    'packages/cms/src/identity/masquerade.ts',
    'export { capability } from "@new-cms/cms/identity";',
  ],
  [
    'packages/cms/src/audit/contracts-alias.ts',
    'export { capability } from "@new-cms/cms/platform/contracts";',
  ],
  ['apps/api/src/adapters/provider.ts', 'export { capability } from "../http/contract.ts";'],
  ['apps/api/src/adapters/alias.ts', 'export { capability } from "@http-contract";'],
  [
    'packages/cms/src/identity/adapters/postgres/alias.ts',
    'export { capability } from "@http-contract";',
  ],
])('regression: the actual CLI rejects the architecture bypass in %s', (file, code) => {
  const result = cli(file, code);
  expect(result.status, result.output).toBe(1);
  expect(result.output).toContain('architecture-boundaries');
});

it('regression: the CLI rejects an adapter importing HTTP through a file URL', () => {
  const target = pathToFileURL(join(cliRoot, 'apps/api/src/http/contract.ts')).href;
  const result = cli(
    'apps/api/src/adapters/file-url.ts',
    `export { capability } from "${target}";`,
  );
  expect(result.status, result.output).toBe(1);
  expect(result.output).toContain('architecture-boundaries');
});

it.each([
  [
    'packages/cms/src/access/valid.ts',
    'export type { Capability } from "@new-cms/cms/identity/composition";',
  ],
  [
    'apps/api/src/adapters/valid.ts',
    'export type { Capability } from "@new-cms/cms/identity/composition";',
  ],
  [
    'apps/api/src/http/valid.ts',
    'export type { Capability } from "@new-cms/cms/platform/contracts";',
  ],
  ['apps/api/src/http/sibling.ts', 'export { capability } from "./contract.ts";'],
  ['apps/api/src/adapters/sibling.ts', 'export { capability } from "./helper.ts";'],
  [
    'packages/cms/src/identity/adapters/postgres/sibling.ts',
    'export { capability } from "./helper.ts";',
  ],
  ['packages/cms/src/audit/valid.ts', 'export type { Database } from "@new-cms/database/client";'],
])('keeps the real CLI legal dependency from %s', (file, code) => {
  const result = cli(file, code);
  expect(result.status, result.output).toBe(0);
});
