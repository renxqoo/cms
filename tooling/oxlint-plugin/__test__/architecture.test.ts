import { expect, it } from 'vitest';
import { architectureBoundaries } from '../index.ts';
import { lintRule } from './rule-harness.ts';

it.each([
  ['apps/api/src/http/roles.ts', 'import type { Database } from "@new-cms/database/client";'],
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
