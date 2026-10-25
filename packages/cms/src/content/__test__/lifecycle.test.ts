import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  workflowCollections,
} from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
async function fixture(options: Parameters<typeof createContentFixture>[0] = {}) {
  const kit = await createContentFixture(options);
  fixtures.push(kit);
  return kit;
}

it('copies drafts with explicit unique overrides and never inherits publication', async () => {
  const kit = await fixture();
  const a = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Source', slug: 'source' },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: a.id,
    revision: 1,
  });
  await expect(
    kit.content.api.copyDocument(kit.owner(), {
      collection: 'articles',
      id: a.id,
      revision: published.revision,
    }),
  ).rejects.toMatchObject({ code: 'identifier_taken' });
  const copy = await kit.content.api.copyDocument(kit.owner(), {
    collection: 'articles',
    id: a.id,
    revision: published.revision,
    data: { slug: 'copy' },
  });
  expect(copy.publishedVersionId).toBeNull();
  expect(copy.data).toEqual({ title: 'Source', slug: 'copy' });
});

it('restores draft visibility without republishing and enforces the purge retention window', async () => {
  const kit = await fixture({ trashRetentionMs: 60000 });
  const a = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Source' },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: a.id,
    revision: 1,
  });
  const trash = await kit.content.api.archiveDocument(kit.owner(), {
    collection: 'articles',
    id: a.id,
    revision: published.revision,
  });
  await expect(
    kit.content.api.purgeDocument(kit.owner(), {
      collection: 'articles',
      id: a.id,
      revision: trash.revision,
    }),
  ).rejects.toMatchObject({ code: 'resource_in_use' });
  const restored = await kit.content.api.restoreTrashedDocument(kit.owner(), {
    collection: 'articles',
    id: a.id,
    revision: trash.revision,
  });
  expect(restored.publishedVersionId).toBeNull();
  expect(restored.trashedAt).toBeNull();
  await expect(
    kit.content.api.getDocument(kit.owner(), {
      collection: 'articles',
      id: a.id,
      mode: 'published',
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
});

it('makes autosave idempotent and protects the published version from retention', async () => {
  const kit = await fixture();
  const a = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Published' },
  });
  const pub = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: a.id,
    revision: 1,
  });
  const ctx = kit.owner();
  const input = {
    collection: 'articles',
    id: a.id,
    revision: pub.revision,
    data: { title: 'Autosave' },
  };
  const auto = await kit.content.api.autosaveDocument(ctx, input);
  expect((await kit.content.api.autosaveDocument(ctx, input)).versionId).toBe(auto.versionId);
  let { revision } = auto;
  for (const title of ['Draft 2', 'Draft 3', 'Draft 4', 'Draft 5']) {
    const result = await kit.content.api.updateDocument(kit.owner(), {
      collection: 'articles',
      id: a.id,
      revision,
      data: { title },
    });
    ({ revision } = result);
  }
  const history = await kit.content.api.listVersions(kit.owner(), {
    collection: 'articles',
    id: a.id,
  });
  expect(history.total).toBe(4);
  expect(history.rows.some((version) => version.id === a.versionId)).toBe(true);
  expect(
    (
      await kit.content.api.getDocument(kit.owner(), {
        collection: 'articles',
        id: a.id,
        mode: 'published',
      })
    ).data['title'],
  ).toBe('Published');
});

it('keeps only the active revision when history is disabled', async () => {
  const kit = await fixture();
  let current = await kit.content.api.createDocument(kit.owner(), {
    collection: 'settings',
    data: { title: 'A' },
  });
  for (const title of ['B', 'C'])
    current = await kit.content.api.updateDocument(kit.owner(), {
      collection: 'settings',
      id: current.id,
      revision: current.revision,
      data: { title },
    });
  const rows = await kit.database.query<{ total: string }>(
    'SELECT count(*) AS total FROM content_revisions WHERE document_id=$1',
    [current.id],
  );
  expect(Number(rows.rows[0]?.total)).toBe(1);
  expect(current.data['title']).toBe('C');
});

it.each(['nullify', 'cascade'] as const)(
  'applies %s as a new revision or logical archive while protecting historical references',
  async (onDelete) => {
    const collections = workflowCollections();
    const [, pages] = collections;
    if (!pages) throw new Error('Pages missing');
    pages.fields = pages.fields.map((field) =>
      field.type === 'relationship' ? { ...field, onDelete } : field,
    );
    const kit = await fixture({ collections });
    const target = await kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Target' },
    });
    const source = await kit.content.api.createDocument(kit.owner(), {
      collection: 'pages',
      data: { title: 'Source', author: { collection: 'articles', id: target.id } },
    });
    const trash = await kit.content.api.archiveDocument(kit.owner(), {
      collection: 'articles',
      id: target.id,
      revision: 1,
    });
    const outcome = await kit.content.api
      .getDocument(kit.owner(), { collection: 'pages', id: source.id })
      .then((view) => ({
        accessible: true,
        author: view.data['author'],
        changedVersion: view.versionId !== source.versionId,
      }))
      .catch((error: unknown) => {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'not_found')
          return { accessible: false };
        throw error;
      });
    expect(outcome).toEqual(
      onDelete === 'nullify'
        ? { accessible: true, author: null, changedVersion: true }
        : { accessible: false },
    );
    await expect(
      kit.content.api.purgeDocument(kit.owner(), {
        collection: 'articles',
        id: target.id,
        revision: trash.revision,
      }),
    ).rejects.toMatchObject({ code: 'resource_in_use' });
    const reference = await kit.content.api.getVersion(kit.owner(), {
      collection: 'pages',
      id: source.id,
      versionId: source.versionId,
    });
    expect(reference.data['author']).toEqual({ collection: 'articles', id: target.id });
  },
);

it('allows logical archive after a relation is removed while a retained history still blocks purge', async () => {
  const kit = await fixture();
  const target = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Target' },
  });
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Source', author: { collection: 'articles', id: target.id } },
  });
  await kit.content.api.updateDocument(kit.owner(), {
    collection: 'pages',
    id: source.id,
    revision: 1,
    data: { author: null },
  });
  const trash = await kit.content.api.archiveDocument(kit.owner(), {
    collection: 'articles',
    id: target.id,
    revision: 1,
  });
  await expect(
    kit.content.api.purgeDocument(kit.owner(), {
      collection: 'articles',
      id: target.id,
      revision: trash.revision,
    }),
  ).rejects.toMatchObject({ code: 'resource_in_use' });
  expect(
    (await kit.content.api.listReferences(kit.owner(), { collection: 'articles', id: target.id }))
      .total,
  ).toBe(2);
});

it('rolls back revisions, active pointers and idempotency when audit append fails', async () => {
  const kit = await fixture();
  const a = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Original' },
  });
  await kit.database.query(
    "CREATE FUNCTION reject_content_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation_id='documents.autosave' THEN RAISE EXCEPTION 'Audit unavailable'; END IF; RETURN NEW; END; $$; CREATE TRIGGER reject_content_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_content_audit()",
  );
  const ctx = kit.owner();
  await expect(
    kit.content.api.autosaveDocument(ctx, {
      collection: 'articles',
      id: a.id,
      revision: 1,
      data: { title: 'Lost' },
    }),
  ).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  const current = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: a.id,
  });
  expect(current.revision).toBe(1);
  expect(current.data['title']).toBe('Original');
  const count = await kit.database.query<{ total: string }>(
    "SELECT count(*) AS total FROM idempotency_records WHERE operation_id='documents.autosave'",
  );
  expect(count.rows[0]?.total).toBe('0');
});

it('saves when the retained history count equals the public page limit', async () => {
  const collections = workflowCollections();
  const [article] = collections;
  if (!article) throw new Error('Article missing');
  article.history = { maxVersions: 100, retentionMs: 604800000 };
  const kit = await fixture({ collections });
  const draft = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Original' },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: draft.id,
    revision: 1,
  });
  const saved = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: draft.id,
    revision: published.revision,
    data: { title: 'New private draft' },
  });
  expect(saved.revision).toBe(3);
  expect(saved.data['title']).toBe('New private draft');
  expect(
    (
      await kit.content.api.getDocument(kit.owner(), {
        collection: 'articles',
        id: draft.id,
        mode: 'published',
      })
    ).data['title'],
  ).toBe('Original');
});

it('does not let a full historical reference window hide a current restrict edge', async () => {
  const kit = await fixture();
  const target = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Protected target' },
  });
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Current referring page', author: { collection: 'articles', id: target.id } },
  });
  const historyCount = kit.limits.maxExpandNodes + 1;
  await kit.database.query(
    "INSERT INTO content_revisions(id,document_id,collection_id,revision,schema_version,kind,actor_id) SELECT ('00000000-0000-1000-8000-'||lpad(g::text,12,'0'))::uuid,r.document_id,r.collection_id,1000+g,1,'reference-history',r.actor_id FROM content_revisions r CROSS JOIN generate_series(1,$2) g WHERE r.id=$1",
    [source.versionId, historyCount],
  );
  await kit.database.query(
    "INSERT INTO content_references(source_revision_id,source_document_id,source_collection_id,projection_schema_version,field_id,source_path,target_document_id,target_collection_id,on_delete,media) SELECT r.id,r.document_id,r.collection_id,1,'author','en:author',$2,$3,'restrict',false FROM content_revisions r WHERE r.document_id=$1 AND kind='reference-history'",
    [source.id, target.id, kit.registry.get('articles').id],
  );
  await expect(
    kit.content.api.archiveDocument(kit.owner(), {
      collection: 'articles',
      id: target.id,
      revision: target.revision,
    }),
  ).rejects.toMatchObject({ code: 'resource_in_use' });
  expect(
    (await kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: target.id }))
      .trashedAt,
  ).toBeNull();
});

it('nullifies one target from a has-many relationship without corrupting the remaining canonical reference', async () => {
  const collections = workflowCollections();
  const [articles] = collections;
  if (!articles) throw new Error('Articles missing');
  articles.fields = articles.fields.map((field) =>
    field.name === 'related' ? { ...field, onDelete: 'nullify' } : field,
  );
  const kit = await fixture({ collections });
  const a = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'A' },
  });
  const b = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'B' },
  });
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: {
      title: 'Source',
      related: [
        { collection: 'articles', id: a.id },
        { collection: 'articles', id: b.id },
      ],
    },
  });
  await kit.content.api.archiveDocument(kit.owner(), {
    collection: 'articles',
    id: a.id,
    revision: a.revision,
  });
  expect(
    (await kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: source.id }))
      .data['related'],
  ).toEqual([{ collection: 'articles', id: b.id }]);
});
