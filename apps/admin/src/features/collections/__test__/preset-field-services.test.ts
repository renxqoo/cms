import { beforeEach, expect, it, vi } from 'vitest';
import { pageApi, resetPageApi, ok, record, recordId } from './page-fixture';
import { presetCollection } from './preset-ui-support';
import { presetFieldServices } from '../preset-field-services';
import { privatePresetAccess } from '../preset-access-editor';
import { failure } from '../../../api/result';
beforeEach(resetPageApi);
const context = {
  collection: presetCollection,
  name: 'Team',
  query: { q: '', columns: ['title'], sort: [] },
  locale: 'zh-CN',
  source: { id: recordId, version: 4 },
};
it('uses the complete selected action candidate and stable row path for filtered references while ordinary reads retain locale resolution', async () => {
  pageApi.request.mockResolvedValue(ok({ rows: [record()], total: 1, page: 1, pageSize: 20 }));
  const access = {
    ...privatePresetAccess(recordId),
    read: { constraint: 'team', data: { region: 'north' }, initialSnapshot: 'signed' },
  };
  const services = presetFieldServices({
    context,
    action: 'read',
    access,
    actor: recordId,
    collections: [{ ...presetCollection, locales: ['en'], defaultLocale: 'en' }],
    report: vi.fn<(...values: unknown[]) => void>(),
  });
  const { signal } = new AbortController();
  await services.searchReferences({
    collections: ['articles'],
    collection: 'articles',
    query: 'News',
    page: 1,
    locale: 'zh-CN',
    sourcePath: 'rows.10000000-0000-4000-8000-000000000001.page',
    filterOptions: true,
    id: recordId,
    signal,
  });
  expect(pageApi.request.mock.calls[0]?.[0]).toMatchObject({
    operation: 'queryPresets.fieldOptions',
    body: {
      action: 'read',
      name: 'Team',
      query: { q: '', columns: ['title'], sort: [] },
      access,
      locale: 'zh-CN',
      id: recordId,
      version: 4,
      path: 'rows.10000000-0000-4000-8000-000000000001.page',
      relationTo: 'articles',
      targetId: recordId,
      q: 'News',
      page: 1,
    },
    signal,
  });
  await services.searchReferences({
    collections: ['articles'],
    collection: 'articles',
    query: 'Other',
    page: 1,
    locale: 'zh-CN',
    sourcePath: 'page',
    signal,
  });
  expect(pageApi.request.mock.calls[1]?.[0]).toMatchObject({
    operation: 'documents.list',
    query: { locale: 'en', fallback: [], q: 'Other' },
    signal,
  });
});
it('rejects invalid reference contexts and suppresses aborted option errors while reporting actual denial', async () => {
  const report = vi.fn<(...values: unknown[]) => void>();
  const services = presetFieldServices({
    context,
    action: 'read',
    access: privatePresetAccess(recordId),
    actor: recordId,
    collections: [presetCollection],
    report,
  });
  const request = {
    collections: ['articles'],
    collection: 'articles',
    query: '',
    page: 1,
    locale: 'zh-CN',
    sourcePath: 'page',
    filterOptions: true,
    signal: new AbortController().signal,
  };
  await expect(services.searchReferences({ ...request, collection: 'other' })).rejects.toThrow(
    'Invalid reference context',
  );
  pageApi.request.mockResolvedValue(failure('forbidden', 403));
  await expect(services.searchReferences(request)).rejects.toThrow('forbidden');
  expect(report).toHaveBeenCalledTimes(1);
  const cancelled = new AbortController();
  cancelled.abort();
  await expect(services.searchReferences({ ...request, signal: cancelled.signal })).rejects.toThrow(
    'cancelled',
  );
  expect(report).toHaveBeenCalledTimes(1);
});
