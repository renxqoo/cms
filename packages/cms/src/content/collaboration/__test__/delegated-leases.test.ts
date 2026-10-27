import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import {
  contentContext,
  createContentFixture,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../../test/support/content-runtime.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});

async function fixture() {
  const collections = workflowCollections();
  const articles = collections.find((collection) => collection.key === 'articles');
  if (!articles) throw new Error('Missing articles');
  articles.lockDocuments = { durationMs: 300000, heartbeatMs: 30000 };
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Delegated edit' },
  });
  return { kit, document, target: { collection: 'articles', id: document.id } };
}

async function delegate(kit: ContentFixture, name: string) {
  const key = await kit.access.api.createApiKey(kit.owner(), {
    name,
    grants: [
      'documents.get',
      'documents.update',
      'documents.getLock',
      'documents.acquireLock',
      'documents.releaseLock',
    ].map((operationId) => ({
      operationId,
      scopeKind: 'collection' as const,
      collectionKey: 'articles',
    })),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  const oauth = kit.identity.oauth({
    issuer: 'https://api.example.test',
    mcpResource: 'https://mcp.example.test/mcp',
    frontendUrl: 'https://admin.example.test',
    bridgeSecret: 'content-lease-fixture-bridge-secret',
  });
  const token = await oauth.exchange(contentContext(), {
    token: key.apiKey,
    bridgeSecret: 'content-lease-fixture-bridge-secret',
  });
  return { id: key.credential.id, ctx: () => contentContext(token.access_token) };
}

it('regression: another delegated credential of the same administrator cannot renew, release or write through an editor lease', async () => {
  const { kit, document, target } = await fixture();
  const first = await delegate(kit, 'First editor');
  const second = await delegate(kit, 'Other editor');
  const editorId = randomUUID();
  const lease = await kit.content.api.acquireEditorLease(first.ctx(), { ...target, editorId });
  expect(lease).toMatchObject({ owned: true, lease: { generation: 1 } });
  for (const ctx of [second.ctx(), kit.owner()]) {
    const rejected = await kit.content.api.acquireEditorLease(ctx, {
      ...target,
      editorId,
      generation: 1,
    });
    expect(rejected).toMatchObject({ owned: false, lease: { generation: 1 } });
    const released = await kit.content.api.releaseEditorLease(ctx, {
      ...target,
      editorId,
      generation: 1,
    });
    expect(released).toMatchObject({ owned: false, lease: { generation: 1 } });
    await expect(
      kit.content.api.updateDocument(
        { ...ctx, editorSessionId: editorId },
        {
          ...target,
          revision: document.revision,
          data: { title: 'Unauthorized ownership' },
        },
      ),
    ).rejects.toMatchObject({ code: 'document_locked' });
  }
  const own = await kit.content.api.updateDocument(
    { ...first.ctx(), editorSessionId: editorId },
    {
      ...target,
      revision: document.revision,
      data: { title: 'Original credential' },
    },
  );
  expect(own.data['title']).toBe('Original credential');
  const released = await kit.content.api.releaseEditorLease(first.ctx(), {
    ...target,
    editorId,
    generation: 1,
  });
  expect(released).toMatchObject({ owned: false, lease: null });
});

it('regression: revoking the original delegated credential invalidates its lease without falling back to administrator authority', async () => {
  const { kit, target } = await fixture();
  const first = await delegate(kit, 'Revoked editor');
  const second = await delegate(kit, 'Replacement editor');
  const editorId = randomUUID();
  await kit.content.api.acquireEditorLease(first.ctx(), { ...target, editorId });
  await kit.access.api.revokeCredential(kit.owner(), { id: first.id });
  const released = await kit.content.api.getEditorLease(kit.owner(), { ...target, editorId });
  expect(released).toMatchObject({ owned: false, lease: null });
  const acquired = await kit.content.api.acquireEditorLease(second.ctx(), { ...target, editorId });
  expect(acquired).toMatchObject({ owned: true, lease: { generation: 2 } });
  await expect(
    kit.content.api.acquireEditorLease(first.ctx(), { ...target, editorId, generation: 1 }),
  ).rejects.toMatchObject({ code: 'unauthenticated' });
});
