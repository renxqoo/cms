import { expect, it } from 'vitest';
import { createContentFixture } from '../../../../../../../test/support/content-runtime.ts';
import { projectionDefinition } from './read-projection-support.ts';

it('management reads keep their field policies and reject the internal storage projection option', async () => {
  const kit = await createContentFixture({ collections: [projectionDefinition()] });
  try {
    const saved = await kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Visible title', body: { retained: true }, secret: 'Private' },
    });
    const all = await kit.content.api.listDocuments(kit.owner(), { collection: 'articles' });
    expect(all.rows.map((row) => ({ id: row.id, data: row.data }))).toEqual([
      { id: saved.id, data: { title: 'Visible title', body: { retained: true } } },
    ]);
    const selected = await kit.content.api.listDocuments(kit.owner(), {
      collection: 'articles',
      select: ['title'],
    });
    expect(selected.rows.map((row) => row.data)).toEqual([{ title: 'Visible title' }]);
    await expect(
      kit.content.api.listDocuments(kit.owner(), {
        collection: 'articles',
        projection: ['title'],
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      kit.content.api.listDocuments(kit.owner(), {
        collection: 'articles',
        where: { field: 'secret', operator: 'eq', value: 'Private' },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  } finally {
    await kit.close();
  }
});
