import { afterEach, expect, it, vi } from 'vitest';
import CatalogPage from '../../../app/(admin)/dashboard/collections/page';
import ListPage from '../../../app/(admin)/dashboard/collections/[collection]/page';
import NewPage from '../../../app/(admin)/dashboard/collections/[collection]/new/page';
import StructurePage from '../../../app/(admin)/dashboard/collections/[collection]/structure/page';
import DocumentPage from '../../../app/(admin)/dashboard/collections/[collection]/[id]/page';
const controls = vi.hoisted(() => ({
  session: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}));
vi.mock('../../../server/require-session', () => ({ requireSession: controls.session }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('Not found');
  },
}));
afterEach(() => vi.clearAllMocks());
it('verifies a real server session before resolving route parameters or producing protected page elements', async () => {
  const denied = new Error('Authentication required');
  controls.session.mockRejectedValueOnce(denied);
  await expect(ListPage({ params: Promise.resolve({ collection: '../invalid' }) })).rejects.toBe(
    denied,
  );
  expect(controls.session).toHaveBeenCalledOnce();
});
it('assembles each protected catalog/list/create/structure route only after session verification', async () => {
  const catalog = await CatalogPage();
  const list = await ListPage({ params: Promise.resolve({ collection: 'articles' }) });
  const create = await NewPage({ params: Promise.resolve({ collection: 'articles' }) });
  const structure = await StructurePage({ params: Promise.resolve({ collection: 'articles' }) });
  expect(controls.session).toHaveBeenCalledTimes(4);
  expect(catalog.type).toBeTypeOf('function');
  expect(list.props).toEqual({ collection: 'articles' });
  expect(create.props).toEqual({ collection: 'articles' });
  expect(structure.props).toEqual({ collection: 'articles' });
});
it.each(['..', 'A-invalid', 'a'.repeat(65), 'with/slash'])(
  'rejects unsafe collection route key %s before assembling its feature',
  async (collection) => {
    for (const route of [ListPage, NewPage, StructurePage])
      await expect(route({ params: Promise.resolve({ collection }) })).rejects.toThrow('Not found');
    await expect(
      DocumentPage({
        params: Promise.resolve({ collection, id: '10000000-0000-4000-8000-000000000001' }),
      }),
    ).rejects.toThrow('Not found');
  },
);
it('validates and normalizes an immutable document id before passing it to the client entry', async () => {
  await expect(
    DocumentPage({ params: Promise.resolve({ collection: 'articles', id: 'not-a-document' }) }),
  ).rejects.toThrow('Not found');
  const result = await DocumentPage({
    params: Promise.resolve({ collection: 'articles', id: 'ABCDEF00-0000-4000-8000-000000000001' }),
  });
  expect(result.props).toEqual({
    collection: 'articles',
    id: 'abcdef00-0000-4000-8000-000000000001',
  });
});
