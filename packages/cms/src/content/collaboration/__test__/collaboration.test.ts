import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import {
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
async function fixture(change?: (collection: CollectionDefinition) => void) {
  const collections = workflowCollections();
  const collection = collections.find((item) => item.key === 'articles');
  if (!collection) throw new Error('Articles missing');
  collection.lockDocuments = { durationMs: 300000, heartbeatMs: 30000 };
  change?.(collection);
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'First' },
  });
  return { kit, target: { collection: 'articles', id: document.id }, document };
}

it('keeps concurrent tabs exclusive and checks the owning editor session on every mutation', async () => {
  const { kit, target } = await fixture();
  const first = randomUUID();
  const second = randomUUID();
  const claims = await Promise.all(
    [first, second].map((editorId) =>
      kit.content.api.acquireEditorLease(kit.owner(), { ...target, editorId }),
    ),
  );
  expect(claims.filter((lease) => lease.owned)).toHaveLength(1);
  const winner = claims[0]?.owned ? first : second;
  const loser = winner === first ? second : first;
  const view = await kit.content.api.getEditorLease(kit.owner(), { ...target, editorId: winner });
  expect(view).toMatchObject({
    enabled: true,
    owned: true,
    heartbeatMs: 30000,
    durationMs: 300000,
    lease: { generation: 1 },
  });
  const renew = await kit.content.api.acquireEditorLease(kit.owner(), {
    ...target,
    editorId: winner,
    generation: 1,
  });
  expect(renew).toMatchObject({ owned: true, lease: { generation: 1 } });
  for (const ctx of [kit.owner(), { ...kit.owner(), editorSessionId: loser }])
    await expect(
      kit.content.api.updateDocument(ctx, { ...target, revision: 1, data: { title: 'Blocked' } }),
    ).rejects.toMatchObject({ code: 'document_locked', status: 423 });
  await expect(kit.content.api.getDocument(kit.owner(), target)).resolves.toMatchObject({
    data: { title: 'First' },
  });
  const changed = await kit.content.api.updateDocument(
    { ...kit.owner(), editorSessionId: winner },
    { ...target, revision: 1, data: { title: 'Owned edit' } },
  );
  expect(changed.data['title']).toBe('Owned edit');
  await expect(
    kit.content.api.autosaveDocument(
      { ...kit.owner(), editorSessionId: loser },
      { ...target, revision: changed.revision, data: { title: 'Stale tab' } },
    ),
  ).rejects.toMatchObject({ code: 'document_locked' });
  await expect(
    kit.content.api.archiveDocument(kit.owner(), { ...target, revision: changed.revision }),
  ).rejects.toMatchObject({ code: 'document_locked' });
  const ignored = await kit.content.api.releaseEditorLease(kit.owner(), {
    ...target,
    editorId: loser,
    generation: 1,
  });
  expect(ignored.lease?.generation).toBe(1);
  const released = await kit.content.api.releaseEditorLease(kit.owner(), {
    ...target,
    editorId: winner,
    generation: 1,
  });
  expect(released).toMatchObject({ owned: false, lease: null });
  await expect(
    kit.content.api.updateDocument(kit.owner(), {
      ...target,
      revision: changed.revision,
      data: { title: 'Released' },
    }),
  ).resolves.toMatchObject({ data: { title: 'Released' } });
});

it('requires explicit unlock permission and protects the replacement lease from late renewals and release', async () => {
  const { kit, target } = await fixture();
  const first = randomUUID();
  const second = randomUUID();
  await kit.content.api.acquireEditorLease(kit.owner(), { ...target, editorId: first });
  const editor = await contentActor(kit, [
    'articles:documents.get',
    'articles:documents.update',
    'articles:documents.acquireLock',
    'articles:documents.getLock',
    'articles:documents.releaseLock',
  ]);
  await expect(
    kit.content.api.unlockDocument(editor.ctx(), { ...target, editorId: second, generation: 1 }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(
    kit.content.api.unlockDocument(kit.owner(), { ...target, editorId: second, generation: 3 }),
  ).rejects.toMatchObject({ code: 'version_conflict' });
  const takeover = await kit.content.api.unlockDocument(kit.owner(), {
    ...target,
    editorId: second,
    generation: 1,
  });
  expect(takeover).toMatchObject({ owned: true, lease: { generation: 2 } });
  const lateRenew = await kit.content.api.acquireEditorLease(kit.owner(), {
    ...target,
    editorId: first,
    generation: 1,
  });
  expect(lateRenew).toMatchObject({ owned: false, lease: { generation: 2 } });
  await kit.content.api.releaseEditorLease(kit.owner(), {
    ...target,
    editorId: first,
    generation: 1,
  });
  expect(
    await kit.content.api.getEditorLease(kit.owner(), { ...target, editorId: second }),
  ).toMatchObject({ owned: true, lease: { generation: 2 } });
  const audits = await kit.database.query<{ detail: { kind: string } }>(
    "SELECT detail FROM audit_events WHERE operation_id='documents.unlock' AND target_id=$1",
    [target.id],
  );
  expect(audits.rows.map((row) => row.detail.kind)).toContain('editorLeaseTakenOver');
});

it('expires leases by database time and never lets an old heartbeat silently reacquire them', async () => {
  const { kit, target } = await fixture();
  const editorId = randomUUID();
  await kit.content.api.acquireEditorLease(kit.owner(), { ...target, editorId });
  await kit.database.query(
    "UPDATE content_document_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE document_id=$1",
    [target.id],
  );
  expect(
    await kit.content.api.acquireEditorLease(kit.owner(), { ...target, editorId, generation: 1 }),
  ).toMatchObject({ owned: false, lease: null });
  expect(
    await kit.content.api.acquireEditorLease(kit.owner(), { ...target, editorId }),
  ).toMatchObject({ owned: true, lease: { generation: 2 } });
  const other = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Other' },
  });
  expect(
    await kit.content.api.getEditorLease(kit.owner(), { collection: 'articles', id: other.id }),
  ).toMatchObject({ lease: null });
  await expect(
    kit.content.api.getEditorLease(kit.owner(), { collection: 'pages', id: target.id }),
  ).rejects.toMatchObject({ code: 'not_found' });
});

it('releases protection immediately after the owner loses update permission', async () => {
  const { kit, target } = await fixture();
  const actor = await contentActor(kit, [
    'articles:documents.get',
    'articles:documents.update',
    'articles:documents.acquireLock',
  ]);
  await kit.content.api.acquireEditorLease(actor.ctx(), { ...target, editorId: randomUUID() });
  await kit.access.api.replaceRolePermissions(kit.owner(), {
    id: actor.role.id,
    version: actor.role.version,
    permissionIds: [],
  });
  const claimed = await kit.content.api.acquireEditorLease(kit.owner(), {
    ...target,
    editorId: randomUUID(),
  });
  expect(claimed).toMatchObject({ owned: true, lease: { generation: 2 } });
});

it('keeps disabled collections usable and validates all lease envelopes', async () => {
  const { kit, target } = await fixture((collection) => {
    collection.lockDocuments = false;
  });
  const editorId = randomUUID();
  expect(await kit.content.api.acquireEditorLease(kit.owner(), { ...target, editorId })).toEqual({
    enabled: false,
    owned: false,
    durationMs: null,
    heartbeatMs: null,
    lease: null,
  });
  expect(await kit.content.api.getEditorLease(kit.owner(), target)).toMatchObject({
    enabled: false,
  });
  expect(
    await kit.content.api.releaseEditorLease(kit.owner(), { ...target, editorId, generation: 1 }),
  ).toMatchObject({ enabled: false });
  await expect(
    kit.content.api.unlockDocument(kit.owner(), { ...target, editorId, generation: 1 }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect(() =>
    kit.content.api.acquireEditorLease(kit.owner(), { ...target, editorId: 'invalid' }),
  ).toThrow('invalid input');
  await expect(kit.content.api.getDocumentPreview(kit.owner(), target)).rejects.toMatchObject({
    code: 'not_found',
  });
});

it('returns only trusted preview URLs computed from the current readable projection', async () => {
  const { kit, target } = await fixture((collection) => {
    collection.preview = {
      origins: ['https://preview.example.test'],
      devices: [
        { name: 'Desktop', width: 1280, height: 720 },
        { name: 'Mobile', width: 390, height: 844 },
      ],
      url: {
        version: '1',
        run: ({ id, locale, data }) =>
          `https://preview.example.test/${id}?locale=${locale}&secret=${typeof data['secret'] === 'string' ? data['secret'] : ''}`,
      },
    };
    collection.livePreview = true;
    collection.fields = [
      ...collection.fields,
      {
        id: 'secret',
        name: 'secret',
        type: 'text',
        access: { read: { version: '1', run: ({ actor }) => actor.role.isSuper } },
      },
    ];
  });
  const editor = await contentActor(kit, [
    'articles:documents.get',
    'articles:documents.preview',
    'articles:collections.editor',
  ]);
  await kit.content.api.updateDocument(kit.owner(), {
    ...target,
    revision: 1,
    data: { secret: 'Confidential' },
  });
  const result = await kit.content.api.getDocumentPreview(editor.ctx(), {
    ...target,
    locale: 'zh',
  });
  expect(result).toMatchObject({
    origin: 'https://preview.example.test',
    live: true,
    devices: [
      { name: 'Desktop', width: 1280, height: 720 },
      { name: 'Mobile', width: 390, height: 844 },
    ],
  });
  expect(result.url).toContain('locale=zh');
  expect(result.url).not.toContain('Confidential');
  const metadata = await kit.content.api.getEditor(editor.ctx(), { ...target, intent: 'read' });
  expect(metadata).toMatchObject({
    preview: true,
    collaboration: { durationMs: 300000, heartbeatMs: 30000 },
  });
  await expect(
    kit.content.api.getDocumentPreview(editor.ctx(), { ...target, locale: 'unknown' }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

it.each([
  'https://other.example.test/x',
  'javascript:alert(1)',
  'https://user:secret@preview.example.test',
  '/relative',
])('rejects unsafe preview result %s', async (url) => {
  const { kit, target } = await fixture((collection) => {
    collection.preview = {
      origins: ['https://preview.example.test'],
      devices: [{ name: 'Desktop', width: 1280, height: 720 }],
      url: { version: '1', run: () => url },
    };
  });
  await expect(kit.content.api.getDocumentPreview(kit.owner(), target)).rejects.toMatchObject({
    code: 'invalid_input',
  });
});

it('keeps an English owner protected when a Chinese caller checks the document and releases a revoked owner', async () => {
  const { kit, target } = await fixture((collection) => {
    collection.access = {
      'documents.update': {
        version: 'locale-write',
        run: ({ actor, locale }) => actor.role.isSuper || locale === 'en',
      },
    };
  });
  const actor = await contentActor(kit, [
    'articles:documents.get',
    'articles:documents.update',
    'articles:documents.acquireLock',
  ]);
  const editorId = randomUUID();
  expect(
    await kit.content.api.acquireEditorLease(actor.ctx(), { ...target, editorId, locale: 'en' }),
  ).toMatchObject({ owned: true });
  const challenger = randomUUID();
  expect(
    await kit.content.api.acquireEditorLease(kit.owner(), {
      ...target,
      editorId: challenger,
      locale: 'zh',
    }),
  ).toMatchObject({ owned: false, lease: { generation: 1 } });
  await expect(
    kit.content.api.updateDocument(kit.owner(), {
      ...target,
      revision: 1,
      locale: 'zh',
      data: { title: 'Blocked' },
    }),
  ).rejects.toMatchObject({ code: 'document_locked' });
  await kit.access.api.replaceRolePermissions(kit.owner(), {
    id: actor.role.id,
    version: actor.role.version,
    permissionIds: [],
  });
  expect(
    await kit.content.api.acquireEditorLease(kit.owner(), {
      ...target,
      editorId: challenger,
      locale: 'zh',
    }),
  ).toMatchObject({ owned: true, lease: { generation: 2 } });
});

it('lets an editor with only Chinese write access acquire and renew the Chinese lease', async () => {
  const { kit, target } = await fixture((collection) => {
    collection.access = {
      'documents.update': {
        version: 'locale-write',
        run: ({ actor, locale }) => actor.role.isSuper || locale === 'zh',
      },
    };
  });
  const actor = await contentActor(kit, [
    'articles:documents.get',
    'articles:documents.update',
    'articles:documents.acquireLock',
    'articles:documents.releaseLock',
  ]);
  const editorId = randomUUID();
  await expect(
    kit.content.api.acquireEditorLease(actor.ctx(), { ...target, editorId, locale: 'en' }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  expect(
    await kit.content.api.acquireEditorLease(actor.ctx(), { ...target, editorId, locale: 'zh' }),
  ).toMatchObject({ owned: true, lease: { generation: 1 } });
  expect(
    await kit.content.api.acquireEditorLease(actor.ctx(), {
      ...target,
      editorId,
      locale: 'zh',
      generation: 1,
    }),
  ).toMatchObject({ owned: true });
  await expect(
    kit.content.api.updateDocument(
      { ...actor.ctx(), editorSessionId: editorId },
      { ...target, revision: 1, locale: 'zh', data: { title: 'Chinese editor' } },
    ),
  ).resolves.toMatchObject({ data: { title: 'Chinese editor' } });
});

it('advances the lease generation on locale transfer and ignores the old locale release and heartbeat', async () => {
  const { kit, target } = await fixture();
  const editorId = randomUUID();
  await kit.content.api.acquireEditorLease(kit.owner(), { ...target, editorId, locale: 'en' });
  expect(
    await kit.content.api.acquireEditorLease(kit.owner(), { ...target, editorId, locale: 'zh' }),
  ).toMatchObject({ owned: true, lease: { generation: 2 } });
  expect(
    await kit.content.api.acquireEditorLease(kit.owner(), {
      ...target,
      editorId,
      locale: 'en',
      generation: 1,
    }),
  ).toMatchObject({ owned: false, lease: { generation: 2 } });
  expect(
    await kit.content.api.releaseEditorLease(kit.owner(), {
      ...target,
      editorId,
      locale: 'en',
      generation: 1,
    }),
  ).toMatchObject({ owned: false, lease: { generation: 2 } });
  expect(
    await kit.content.api.getEditorLease(kit.owner(), { ...target, editorId, locale: 'zh' }),
  ).toMatchObject({ owned: true, lease: { generation: 2 } });
});

it('regression: archiving ends the lease atomically and a late release cannot block restore or clear a new lease', async () => {
  const { kit, target, document } = await fixture();
  const editorId = randomUUID();
  const owner = { ...kit.owner(), editorSessionId: editorId };
  await kit.content.api.acquireEditorLease(owner, { ...target, editorId });
  const archived = await kit.content.api.archiveDocument(owner, {
    ...target,
    revision: document.revision,
  });
  expect(archived.trashedAt).not.toBeNull();
  await expect(
    kit.content.api.releaseEditorLease(owner, { ...target, editorId, generation: 1 }),
  ).resolves.toMatchObject({ lease: null });
  const restored = await kit.content.api.restoreTrashedDocument(kit.owner(), {
    ...target,
    revision: archived.revision,
  });
  expect(restored.trashedAt).toBeNull();
  const fresh = await kit.content.api.acquireEditorLease(owner, { ...target, editorId });
  expect(fresh).toMatchObject({ owned: true, lease: { generation: 3 } });
  await kit.content.api.releaseEditorLease(owner, { ...target, editorId, generation: 1 });
  await expect(
    kit.content.api.getEditorLease(owner, { ...target, editorId }),
  ).resolves.toMatchObject({ owned: true, lease: { generation: 3 } });
});
