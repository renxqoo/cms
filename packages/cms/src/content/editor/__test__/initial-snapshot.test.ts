import { expect, it, vi } from 'vitest';
import { workflowCollections } from '../../../../../../test/support/content-runtime.ts';
import { contentContext } from '../../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../../test/support/content-runtime.ts';
import { article, fixture } from './support.ts';

it('regression: previews reuse non-deterministic read-only defaults from the initial editor without evaluating them again', async () => {
  const collections = workflowCollections();
  let defaults = 0;
  article(collections).fields = [
    ...article(collections).fields,
    {
      id: 'reference',
      name: 'reference',
      type: 'text',
      defaultValue: { version: 'sequence', run: () => `Generated ${++defaults}` },
      access: { write: { version: 'readonly', run: () => false } },
    },
    {
      id: 'detail',
      name: 'detail',
      type: 'text',
      admin: {
        condition: {
          version: 'initial-default',
          run: ({ data }) => data['reference'] === 'Generated 1',
        },
      },
    },
  ];
  const kit = await fixture(collections);
  const editor = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    intent: 'create',
    mode: 'editing',
  });
  const values = {
    collection: 'articles',
    intent: 'create',
    mode: 'editing',
    initialSnapshot: editor.initialSnapshot,
    data: { ...editor.initialData, title: 'Candidate' },
  };
  expect(
    (await kit.content.api.previewEditor(kit.owner(), values)).visibility['detail#detail'],
  ).toBe(true);
  expect(
    (await kit.content.api.previewEditor(kit.owner(), values)).visibility['detail#detail'],
  ).toBe(true);
  expect(defaults).toBe(1);
  await expect(
    kit.content.api.previewEditor(kit.owner(), {
      ...values,
      data: { ...values.data, reference: 'Forged' },
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});

it('initial editor snapshots reject altered data, cross-locale replay and expired authority', async () => {
  const kit = await fixture();
  const editor = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    intent: 'create',
    mode: 'editing',
    locale: 'en',
  });
  if (!editor.initialSnapshot) throw new Error('Missing initial snapshot');
  const values = {
    collection: 'articles',
    intent: 'create',
    mode: 'editing',
    locale: 'en',
    initialSnapshot: editor.initialSnapshot,
    data: { ...editor.initialData, title: 'Candidate' },
  };
  const [payload, signature] = editor.initialSnapshot.split('.');
  if (!payload || !signature) throw new Error('Invalid fixture snapshot');
  const changed = Buffer.from(JSON.stringify({ data: { title: 'Forged' } })).toString('base64url');
  await expect(
    kit.content.api.previewEditor(kit.owner(), {
      ...values,
      initialSnapshot: `${changed}.${signature}`,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    kit.content.api.previewEditor(kit.owner(), { ...values, locale: 'zh' }),
  ).rejects.toMatchObject({ code: 'version_conflict' });
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + kit.policy.sessionTtlMs);
  try {
    await expect(kit.content.api.previewEditor(kit.owner(), values)).rejects.toMatchObject({
      code: 'version_conflict',
    });
  } finally {
    clock.mockRestore();
  }
  expect((await kit.content.api.listDocuments(kit.owner(), { collection: 'articles' })).total).toBe(
    0,
  );
});

async function delegatedContext(kit: ContentFixture, name: string) {
  const config = {
    issuer: 'https://api.example.test',
    mcpResource: 'https://mcp.example.test/mcp',
    frontendUrl: 'https://admin.example.test',
    bridgeSecret: 'initial-snapshot-test-bridge-secret',
  };
  const credential = await kit.access.api.createApiKey(kit.owner(), {
    name,
    expiresAt: new Date(Date.now() + kit.policy.sessionTtlMs).toISOString(),
    grants: [
      'collections.editor',
      'collections.previewEditor',
      'documents.create',
      'documents.get',
      'collections.get',
    ].map((operationId) => ({ operationId, scopeKind: 'collection', collectionKey: 'articles' })),
  });
  const access = await kit.identity
    .oauth(config)
    .exchange(contentContext(), { token: credential.apiKey, bridgeSecret: config.bridgeSecret });
  return contentContext(access.access_token);
}

it('a signed initial editor snapshot is bound to the exact delegated credential of the same administrator', async () => {
  const kit = await fixture();
  const first = await delegatedContext(kit, 'First editor');
  const second = await delegatedContext(kit, 'Second editor');
  const editor = await kit.content.api.getEditor(first, {
    collection: 'articles',
    intent: 'create',
    mode: 'editing',
  });
  const values = {
    collection: 'articles',
    intent: 'create',
    mode: 'editing',
    initialSnapshot: editor.initialSnapshot,
    data: { ...editor.initialData, title: 'Candidate' },
  };
  expect((await kit.content.api.previewEditor(first, values)).visibility).toEqual({});
  await expect(kit.content.api.previewEditor(second, values)).rejects.toMatchObject({
    code: 'version_conflict',
  });
  await expect(kit.content.api.previewEditor(kit.owner(), values)).rejects.toMatchObject({
    code: 'version_conflict',
  });
});
