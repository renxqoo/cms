import { z } from 'zod';
import { expect, it } from 'vitest';
import {
  contentCollection,
  createContentFixture,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import { contentActor } from '../../../../../../test/support/content-actor.ts';
import type { PresetAccess } from '../preset-access-contracts.ts';
const query = { q: '', columns: ['title'], sort: [{ field: 'title', order: 'asc' }] };
function rules(read = 'onlyMe', update = 'onlyMe', remove = 'onlyMe'): PresetAccess {
  return {
    read: { constraint: read },
    update: { constraint: update },
    delete: { constraint: remove },
  };
}

it('enforces independent read/update/delete rules and revokes shared access immediately without an owner bypass', async () => {
  const kit = await createContentFixture();
  try {
    const editor = await contentActor(kit, [
      'articles:documents.list',
      'articles:queryPresets.list',
      'articles:queryPresets.update',
      'articles:queryPresets.delete',
    ]);
    const preset = await kit.content.api.createQueryPreset(kit.owner(), {
      collection: 'articles',
      name: 'Private',
      query,
    });
    expect(
      await kit.content.api.listQueryPresets(editor.ctx(), { collection: 'articles' }),
    ).toMatchObject({ total: 0 });
    const shared = await kit.content.api.shareQueryPreset(kit.owner(), {
      collection: 'articles',
      id: preset.id,
      version: preset.version,
      access: rules('everyone', 'everyone'),
    });
    const visible = await kit.content.api.listQueryPresets(editor.ctx(), {
      collection: 'articles',
    });
    expect(visible.rows[0]?.permissions).toEqual({ read: true, update: true, delete: false });
    await expect(
      kit.content.api.deleteQueryPreset(editor.ctx(), {
        collection: 'articles',
        id: preset.id,
        version: shared.version,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    const updated = await kit.content.api.updateQueryPreset(editor.ctx(), {
      collection: 'articles',
      id: preset.id,
      version: shared.version,
      name: 'Collaborative edit',
      query,
    });
    expect(updated.name).toBe('Collaborative edit');
    await expect(
      kit.content.api.updateQueryPreset(editor.ctx(), {
        collection: 'articles',
        id: preset.id,
        version: shared.version,
        name: 'Stale',
        query,
      }),
    ).rejects.toMatchObject({ code: 'version_conflict' });
    await kit.content.api.shareQueryPreset(kit.owner(), {
      collection: 'articles',
      id: preset.id,
      version: updated.version,
      access: rules(),
    });
    expect(
      await kit.content.api.listQueryPresets(editor.ctx(), { collection: 'articles' }),
    ).toMatchObject({ total: 0 });
  } finally {
    await kit.close();
  }
});

it('renders declared custom fields, protects signed defaults, validates candidates and indexes relationship parameters atomically', async () => {
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  article.queryPresetConstraints = {
    read: [
      {
        value: 'scoped',
        label: 'Scoped',
        fields: [
          {
            id: 'scope',
            name: 'scope',
            type: 'select',
            required: true,
            options: ['allowed', 'denied'],
          },
          {
            id: 'nonce',
            name: 'nonce',
            type: 'text',
            defaultValue: { version: '1', run: () => 'approved' },
            access: { write: { version: '1', run: () => false } },
          },
          {
            id: 'secret',
            name: 'secret',
            type: 'text',
            defaultValue: 'PRIVATE',
            access: {
              read: { version: '1', run: () => false },
              write: { version: '1', run: () => false },
            },
          },
          {
            id: 'page',
            name: 'page',
            type: 'relationship',
            relationTo: ['pages'],
            filterOptions: { field: 'title', operator: 'eq', value: 'Allowed' },
          },
        ],
        access: { version: '1', run: ({ data }) => data['scope'] === 'allowed' },
      },
    ],
    update: [{ value: 'deny', label: 'Deny', access: { version: '1', run: () => false } }],
  };
  const kit = await createContentFixture({ collections });
  try {
    const target = await kit.content.api.createDocument(kit.owner(), {
      collection: 'pages',
      data: { title: 'Allowed' },
    });
    await kit.content.api.createDocument(kit.owner(), {
      collection: 'pages',
      data: { title: 'Blocked' },
    });
    const access = rules();
    access.read = {
      constraint: 'scoped',
      data: { scope: 'allowed', page: { collection: 'pages', id: target.id } },
    };
    const candidate = {
      collection: 'articles',
      name: 'Custom',
      query,
      action: 'read',
      access,
      locale: 'en',
    };
    const preview = await kit.content.api.previewQueryPreset(kit.owner(), candidate);
    expect(preview.layout.map((node) => [node.name, node.type])).toEqual([
      ['scope', 'select'],
      ['nonce', 'text'],
      ['page', 'relationship'],
    ]);
    expect(preview.data).toMatchObject({ scope: 'allowed', nonce: 'approved' });
    expect(JSON.stringify(preview)).not.toContain('PRIVATE');
    if (!preview.initialSnapshot) throw new Error('Missing signed defaults');
    const signed = z
      .object({ data: z.record(z.string(), z.json()) })
      .parse(
        JSON.parse(
          Buffer.from(preview.initialSnapshot.split('.')[0] ?? '', 'base64url').toString('utf8'),
        ) as unknown,
      );
    expect(signed.data['secret']).toBeUndefined();
    const options = await kit.content.api.queryPresetFieldOptions(kit.owner(), {
      ...candidate,
      path: 'page',
      relationTo: 'pages',
    });
    expect(options.rows.map((row) => row.id)).toEqual([target.id]);
    await expect(
      kit.content.api.createQueryPreset(kit.owner(), {
        collection: 'articles',
        name: 'Forged',
        query,
        access: {
          ...access,
          read: { ...access.read, data: { ...access.read.data, nonce: 'forged' } },
        },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const created = await kit.content.api.createQueryPreset(kit.owner(), {
      collection: 'articles',
      name: 'Custom',
      query,
      access: {
        ...access,
        read: { ...access.read, data: preview.data, initialSnapshot: preview.initialSnapshot },
      },
    });
    expect(created.access.read.data?.['secret']).toBeUndefined();
    await expect(
      kit.content.api.archiveDocument(kit.owner(), {
        collection: 'pages',
        id: target.id,
        revision: target.revision,
      }),
    ).rejects.toMatchObject({ code: 'resource_in_use' });
    await expect(
      kit.content.api.shareQueryPreset(kit.owner(), {
        collection: 'articles',
        id: created.id,
        version: created.version,
        access: { ...created.access, update: { constraint: 'deny' } },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const updated = await kit.content.api.shareQueryPreset(kit.owner(), {
      collection: 'articles',
      id: created.id,
      version: created.version,
      access: rules(),
    });
    expect(updated.version).toBe(created.version + 1);
    await expect(
      kit.content.api.archiveDocument(kit.owner(), {
        collection: 'pages',
        id: target.id,
        revision: target.revision,
      }),
    ).resolves.toMatchObject({ id: target.id });
  } finally {
    await kit.close();
  }
});
