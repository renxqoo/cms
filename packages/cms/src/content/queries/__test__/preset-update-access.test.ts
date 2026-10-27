import { expect, it } from 'vitest';
import {
  contentCollection,
  createContentFixture,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import { contentActor } from '../../../../../../test/support/content-actor.ts';

it('regression: a delegated query update cannot transfer the owner-only deletion rule without sharing permission', async () => {
  const kit = await createContentFixture();
  try {
    const editor = await contentActor(kit, [
      'articles:documents.list',
      'articles:queryPresets.update',
      'articles:queryPresets.delete',
    ]);
    const query = { q: '', columns: ['title'], sort: [] };
    const original = await kit.content.api.createQueryPreset(kit.owner(), {
      collection: 'articles',
      name: 'Owner view',
      query,
      access: {
        read: { constraint: 'everyone' },
        update: { constraint: 'everyone' },
        delete: { constraint: 'onlyMe' },
      },
    });
    await expect(
      kit.content.api.shareQueryPreset(editor.ctx(), {
        collection: 'articles',
        id: original.id,
        version: original.version,
        access: original.access,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const updated = await kit.content.api.updateQueryPreset(editor.ctx(), {
      collection: 'articles',
      id: original.id,
      version: original.version,
      name: 'Delegated edit',
      query: { ...query, q: 'News' },
    });
    expect.soft(updated.access).toEqual(original.access);
    expect.soft(updated.permissions.delete).toBe(false);
    await expect(
      kit.content.api.deleteQueryPreset(editor.ctx(), {
        collection: 'articles',
        id: original.id,
        version: updated.version,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  } finally {
    await kit.close();
  }
});

it('regression: a query-only edit preserves hidden parameters and their references while checking new read/update eligibility', async () => {
  const collections = workflowCollections();
  contentCollection(collections, 'articles').queryPresetConstraints = {
    read: [
      {
        value: 'visible',
        label: 'Visible',
        fields: [
          {
            id: 'target',
            name: 'target',
            type: 'relationship',
            relationTo: ['pages'],
            access: {
              read: { version: '1', run: ({ actor }) => actor.role.isSuper },
              write: { version: '1', run: ({ actor }) => actor.role.isSuper },
            },
          },
        ],
        access: { version: '1', run: ({ preset }) => preset.name !== 'Locked' },
      },
    ],
    update: [
      {
        value: 'editable',
        label: 'Editable',
        access: { version: '1', run: ({ preset }) => preset.query.q !== 'Denied' },
      },
    ],
  };
  const kit = await createContentFixture({ collections });
  try {
    const target = await kit.content.api.createDocument(kit.owner(), {
      collection: 'pages',
      data: { title: 'Protected target' },
    });
    const query = { q: '', columns: ['title'], sort: [] };
    const preset = await kit.content.api.createQueryPreset(kit.owner(), {
      collection: 'articles',
      name: 'Owner settings',
      query,
      access: {
        read: { constraint: 'visible', data: { target: { collection: 'pages', id: target.id } } },
        update: { constraint: 'editable' },
        delete: { constraint: 'onlyMe' },
      },
    });
    const editor = await contentActor(kit, [
      'articles:documents.list',
      'articles:queryPresets.update',
    ]);
    const input = {
      collection: 'articles',
      id: preset.id,
      version: preset.version,
      name: 'Renamed',
      query,
    };
    const updated = await kit.content.api.updateQueryPreset(editor.ctx(), input);
    expect(updated.access.read.data).toEqual({});
    await expect(
      kit.content.api.updateQueryPreset(editor.ctx(), {
        ...input,
        version: updated.version,
        name: 'Locked',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      kit.content.api.updateQueryPreset(editor.ctx(), {
        ...input,
        version: updated.version,
        query: { ...query, q: 'Denied' },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const preserved = await kit.content.api.listQueryPresets(kit.owner(), {
      collection: 'articles',
    });
    expect(preserved.rows[0]).toMatchObject({
      name: 'Renamed',
      version: updated.version,
      access: preset.access,
    });
    await expect(
      kit.content.api.archiveDocument(kit.owner(), {
        collection: 'pages',
        id: target.id,
        revision: target.revision,
      }),
    ).rejects.toMatchObject({ code: 'resource_in_use' });
  } finally {
    await kit.close();
  }
});
