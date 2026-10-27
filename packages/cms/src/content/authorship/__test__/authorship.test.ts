import { afterEach, expect, it } from 'vitest';
import {
  contentContext,
  createContentFixture,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../../test/support/content-runtime.ts';
import { contentActor } from '../../../../../../test/support/content-actor.ts';
import type { CollectionDefinition } from '../../definition.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
async function fixture(
  authorship?: CollectionDefinition['authorship'],
  change?: (collection: CollectionDefinition) => void,
) {
  const collections = workflowCollections();
  const article = collections.find((collection) => collection.key === 'articles');
  if (!article) throw new Error('Missing articles');
  if (authorship !== undefined) article.authorship = authorship;
  change?.(article);
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const owner = await kit.access.api.me(kit.owner(), {});
  return { kit, owner };
}

it('stamps the original creator, tracks successful writers and reattributes copies without exposing identities to an unprivileged editor', async () => {
  const { kit, owner } = await fixture();
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Original' },
  });
  expect(document.createdBy).toMatchObject({ id: owner.id });
  expect(document.updatedBy).toMatchObject({ id: owner.id });
  const editor = await contentActor(kit, [
    'articles:documents.get',
    'articles:documents.update',
    'articles:documents.copy',
    'articles:documents.create',
  ]);
  const changed = await kit.content.api.updateDocument(editor.ctx(), {
    collection: 'articles',
    id: document.id,
    revision: document.revision,
    data: { title: 'Edited' },
  });
  expect(changed.createdBy).toBeNull();
  expect(changed.updatedBy).toBeNull();
  const view = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: document.id,
  });
  expect(view.createdBy).toMatchObject({ id: owner.id });
  expect(view.updatedBy?.id).not.toBe(owner.id);
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: document.id,
    revision: changed.revision,
  });
  expect(published.createdBy).toMatchObject({ id: owner.id });
  expect(published.updatedBy).toMatchObject({ id: owner.id });
  const copy = await kit.content.api.copyDocument(editor.ctx(), {
    collection: 'articles',
    id: document.id,
    revision: published.revision,
    data: { title: 'Copy' },
  });
  const copied = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: copy.id,
  });
  expect(copied.createdBy?.id).toBe(view.updatedBy?.id);
  expect(copied.updatedBy?.id).toBe(view.updatedBy?.id);
});

it('supports only enabled UUID authorship metadata comparisons and rejects identity traversal and unauthorized filters', async () => {
  const { kit, owner } = await fixture();
  await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Tracked' },
  });
  for (const field of ['createdBy', 'updatedBy']) {
    for (const [operator, value, expected] of [
      ['eq', owner.id, 1],
      ['ne', owner.id, 0],
      ['in', [owner.id], 1],
      ['notIn', [owner.id], 0],
      ['exists', true, 1],
      ['exists', false, 0],
    ] as const) {
      const page = await kit.content.api.listDocuments(kit.owner(), {
        collection: 'articles',
        where: { field, operator, value },
      });
      expect(page.total).toBe(expected);
    }
  }
  const unknown = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Unknown legacy author' },
  });
  await kit.database.query(
    'UPDATE content_documents SET created_by=NULL,updated_by=NULL WHERE id=$1',
    [unknown.id],
  );
  for (const operator of ['ne', 'notIn'] as const) {
    const result = await kit.content.api.listDocuments(kit.owner(), {
      collection: 'articles',
      where: { field: 'createdBy', operator, value: operator === 'notIn' ? [owner.id] : owner.id },
    });
    expect(result.rows.map((row) => row.id)).toEqual([unknown.id]);
  }
  const reader = await contentActor(kit, ['articles:documents.list']);
  await expect(
    kit.content.api.listDocuments(reader.ctx(), {
      collection: 'articles',
      where: { field: 'createdBy', operator: 'eq', value: owner.id },
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  for (const where of [
    { field: 'createdBy.email', operator: 'eq', value: 'private@example.test' },
    { field: 'createdBy', operator: 'gt', value: owner.id },
    { field: 'createdBy', operator: 'all', value: [owner.id] },
    { field: 'createdBy', operator: 'in', value: [null] },
    { field: 'createdBy', operator: 'eq', value: 'not-a-uuid' },
  ])
    await expect(
      kit.content.api.listDocuments(kit.owner(), { collection: 'articles', where }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
});

it.each([
  [false, { createdBy: false, updatedBy: false }],
  [{ createdBy: false }, { createdBy: false, updatedBy: true }],
  [{ updatedBy: false }, { createdBy: true, updatedBy: false }],
] as const)(
  'honors independent switches and never accepts authored identities from client data: %j',
  async (authorship, enabled) => {
    const { kit } = await fixture(authorship);
    await expect(
      kit.content.api.createDocument(kit.owner(), {
        collection: 'articles',
        data: { title: 'Forged', createdBy: '11111111-1111-4111-8111-111111111111' },
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    const document = await kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Configured' },
    });
    for (const field of ['createdBy', 'updatedBy'] as const)
      expect(Object.hasOwn(document, field)).toBe(enabled[field]);
    const disabled = (['createdBy', 'updatedBy'] as const).filter((field) => !enabled[field]);
    for (const field of disabled)
      await expect(
        kit.content.api.listDocuments(kit.owner(), {
          collection: 'articles',
          where: { field, operator: 'exists', value: true },
        }),
      ).rejects.toMatchObject({ code: 'forbidden' });
  },
);

it('rechecks author identity read permission immediately after role revocation and exposes no private identity fields', async () => {
  const { kit } = await fixture();
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Identity protected' },
  });
  const reader = await contentActor(kit, [
    'articles:documents.get',
    'articles:documents.list',
    'articles:collections.get',
  ]);
  const endpoints = await kit.access.api.listEndpoints(kit.owner(), {
    module: 'access',
    pageSize: 100,
  });
  const permissionId = endpoints.rows.find((endpoint) => endpoint.operationId === 'admins.get')
    ?.binding?.permissionId;
  if (!permissionId) throw new Error('Missing admin identity binding');
  const allowed = await kit.access.api.replaceRolePermissions(kit.owner(), {
    id: reader.role.id,
    version: reader.role.version,
    permissionIds: [...reader.role.permissionIds, permissionId],
  });
  const visible = await kit.content.api.getDocument(reader.ctx(), {
    collection: 'articles',
    id: document.id,
  });
  expect(visible.createdBy).toEqual(document.createdBy);
  expect(Object.keys(visible.createdBy ?? {}).toSorted()).toEqual(['displayName', 'id']);
  const metadata = await kit.content.api.getCollection(reader.ctx(), { collection: 'articles' });
  expect(metadata.authorship).toMatchObject({ createdBy: true, updatedBy: true, queryable: true });
  await kit.access.api.replaceRolePermissions(kit.owner(), {
    id: reader.role.id,
    version: allowed.version,
    permissionIds: reader.role.permissionIds,
  });
  const hidden = await kit.content.api.getDocument(reader.ctx(), {
    collection: 'articles',
    id: document.id,
  });
  expect(hidden.createdBy).toBeNull();
  expect(hidden.updatedBy).toBeNull();
  const page = await kit.content.api.listDocuments(reader.ctx(), { collection: 'articles' });
  expect(page.rows[0]?.createdBy).toBeNull();
  expect(
    (await kit.content.api.getCollection(reader.ctx(), { collection: 'articles' })).authorship
      .queryable,
  ).toBe(false);
});

it('attributes autosave, queued withdrawal, archive and restore to their actual successful actors', async () => {
  const { kit, owner } = await fixture();
  const editor = await contentActor(kit, [
    'articles:documents.get',
    'articles:documents.update',
    'articles:documents.autosave',
    'articles:documents.archive',
    'articles:documents.unpublish',
    'articles:content.schedulePublication',
  ]);
  const original = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Lifecycle' },
  });
  const autosaved = await kit.content.api.autosaveDocument(editor.ctx(), {
    collection: 'articles',
    id: original.id,
    revision: original.revision,
    locale: 'zh',
    data: { title: '中文更新' },
  });
  const changed = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: original.id,
  });
  const editorId = changed.updatedBy?.id;
  expect(editorId).toBeTruthy();
  expect(editorId).not.toBe(owner.id);
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: original.id,
    revision: autosaved.revision,
  });
  const accepted = await kit.content.api.schedulePublication(editor.ctx(), {
    collection: 'articles',
    id: original.id,
    revision: published.revision,
    versionId: published.publishedVersionId,
    action: 'unpublish',
    executeAt: new Date(Date.now() + 60_000).toISOString(),
  });
  await kit.database.query('UPDATE content_jobs SET execute_at=clock_timestamp() WHERE id=$1', [
    accepted.jobId,
  ]);
  await kit.content.maintenance();
  expect(
    await kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: accepted.jobId }),
  ).toMatchObject({ status: 'succeeded' });
  const withdrawn = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: original.id,
  });
  expect(withdrawn.updatedBy?.id).toBe(editorId);
  await kit.content.api.archiveDocument(editor.ctx(), {
    collection: 'articles',
    id: original.id,
    revision: withdrawn.revision,
  });
  const trashed = await kit.content.api.listDocuments(kit.owner(), {
    collection: 'articles',
    trashed: true,
  });
  expect(trashed.rows[0]?.createdBy?.id).toBe(owner.id);
  expect(trashed.rows[0]?.updatedBy?.id).toBe(editorId);
  const [archived] = trashed.rows;
  if (!archived) throw new Error('Missing archived document');
  const restored = await kit.content.api.restoreTrashedDocument(kit.owner(), {
    collection: 'articles',
    id: original.id,
    revision: archived.revision,
  });
  expect(restored.createdBy?.id).toBe(owner.id);
  expect(restored.updatedBy?.id).toBe(owner.id);
});

it('permits trusted ownership policies without granting user-controlled author identity filters', async () => {
  const { kit } = await fixture(undefined, (collection) => {
    collection.access = {
      'documents.list': {
        version: 'creator-only',
        run: ({ actor }) => ({ field: 'createdBy', operator: 'eq', value: actor.id }),
      },
    };
  });
  await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Owner document' },
  });
  const editor = await contentActor(kit, ['articles:documents.create', 'articles:documents.list']);
  const own = await kit.content.api.createDocument(editor.ctx(), {
    collection: 'articles',
    data: { title: 'Own document' },
  });
  const visible = await kit.content.api.listDocuments(editor.ctx(), { collection: 'articles' });
  expect(visible.rows.map((row) => row.id)).toEqual([own.id]);
  expect(visible.rows[0]?.createdBy).toBeNull();
});

it('regression: a delegated administrator cannot inherit author identity visibility outside the credential grants', async () => {
  const { kit } = await fixture();
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Delegated privacy' },
  });
  const oauth = kit.identity.oauth({
    issuer: 'https://api.example.test',
    mcpResource: 'https://mcp.example.test/mcp',
    frontendUrl: 'https://admin.example.test',
    bridgeSecret: 'author-fixture-bridge-secret',
  });
  async function issue(identity: boolean) {
    const grants = [
      { operationId: 'documents.get', scopeKind: 'collection' as const, collectionKey: 'articles' },
      ...(identity
        ? [{ operationId: 'admins.get', scopeKind: 'global' as const, collectionKey: null }]
        : []),
    ];
    const key = await kit.access.api.createApiKey(kit.owner(), {
      name: identity ? 'Author reader' : 'Content only',
      grants,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const token = await oauth.exchange(contentContext(), {
      token: key.apiKey,
      bridgeSecret: 'author-fixture-bridge-secret',
    });
    return { key, ctx: () => contentContext(token.access_token) };
  }
  const limited = await issue(false);
  const hidden = await kit.content.api.getDocument(limited.ctx(), {
    collection: 'articles',
    id: document.id,
  });
  expect(hidden.createdBy).toBeNull();
  const authorized = await issue(true);
  const visible = await kit.content.api.getDocument(authorized.ctx(), {
    collection: 'articles',
    id: document.id,
  });
  expect(visible.createdBy).toEqual(document.createdBy);
  await kit.access.api.revokeCredential(kit.owner(), { id: authorized.key.credential.id });
  await expect(
    kit.content.api.getDocument(authorized.ctx(), { collection: 'articles', id: document.id }),
  ).rejects.toMatchObject({ code: 'unauthenticated' });
});
