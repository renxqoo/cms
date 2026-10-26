import type { ImageVariant } from '../../../contracts/assets';
import { expect, it, vi } from 'vitest';
import {
  assetManifestSchema,
  cleanupPageSchema,
  cleanupRetryReceiptSchema,
  jobResultSchema,
  jobSummaryPageSchema,
  resourceReferencePageSchema,
  uploadPageSchema,
} from '../../../contracts/assets';
import { createBlobResource } from '../blob-resource';
import {
  editsRecipe,
  parsedVariants,
  recipeEdits,
  validRecipe,
  variantDrafts,
} from '../image-recipe';
import { parseResourceQuery, resourceQueryHref, resourceRequest } from '../resource-query';
import { cleanupQueryHref, parseCleanupQuery } from '../cleanup-query';
import { parseWorkQuery, workFilters, workQueryHref } from '../../jobs/query';
import {
  budget,
  first,
  manifest,
  second,
  session,
} from '../../../../test/support/admin-asset-data';

it('converts normalized crop edges to bounded integer pixels and keeps focal coordinates', () => {
  const result = editsRecipe(
    { crop: { x: 0.25, y: 0.2, width: 0.5, height: 0.6 }, focalPoint: { x: 0.8, y: 0.1 } },
    { width: 40, height: 30 },
  );
  expect(result).toEqual({
    crop: { left: 10, top: 6, width: 20, height: 18 },
    focalPoint: { x: 0.8, y: 0.1 },
  });
  expect(
    editsRecipe(
      { crop: { x: 0.9, y: 0, width: 0.1, height: 1 }, focalPoint: { x: 1, y: 0 } },
      { width: 3, height: 2 },
    ),
  ).toEqual({ crop: { left: 2, top: 0, width: 1, height: 2 }, focalPoint: { x: 1, y: 0 } });
  expect(recipeEdits({ ...result, variants: [] }, { width: 40, height: 30 })).toEqual({
    crop: { x: 0.25, y: 0.2, width: 0.5, height: 0.6 },
    focalPoint: { x: 0.8, y: 0.1 },
  });
  expect(recipeEdits({ variants: [] }, { width: 40, height: 30 })).toEqual({
    crop: { x: 0, y: 0, width: 1, height: 1 },
    focalPoint: { x: 0.5, y: 0.5 },
  });
});
it.each([
  { crop: { x: -0.1, y: 0, width: 1, height: 1 }, focalPoint: { x: 0.5, y: 0.5 } },
  { crop: { x: 0.8, y: 0, width: 0.3, height: 1 }, focalPoint: { x: 0.5, y: 0.5 } },
  { crop: { x: 0, y: 0, width: 0, height: 1 }, focalPoint: { x: 0.5, y: 0.5 } },
  { crop: { x: 0, y: 0, width: 1, height: 1 }, focalPoint: { x: NaN, y: 0.5 } },
])('rejects invalid crop or focal values before creating a recipe: %j', (edits) =>
  expect(editsRecipe(edits, { width: 40, height: 30 })).toBeNull(),
);
it('rejects dimensions without positive integer pixels and keeps empty variant numeric drafts invalid', () => {
  expect(
    editsRecipe(
      { crop: { x: 0, y: 0, width: 1, height: 1 }, focalPoint: { x: 0.5, y: 0.5 } },
      { width: 0, height: 30 },
    ),
  ).toBeNull();
  expect(
    parsedVariants([
      {
        id: first,
        name: 'thumb',
        width: '',
        height: '30',
        fit: 'cover',
        format: 'png',
        quality: '90',
      },
    ]),
  ).toBeNull();
  expect(
    parsedVariants([
      {
        id: first,
        name: 'thumb',
        width: '2x',
        height: '30',
        fit: 'cover',
        format: 'png',
        quality: '90',
      },
    ]),
  ).toBeNull();
});
it('validates variants, duplicate/reserved names, crop bounds and every metadata output budget', () => {
  const variant: ImageVariant = {
    name: 'thumb',
    width: 20,
    height: 10,
    fit: 'cover',
    format: 'png',
    quality: 90,
  };
  const recipe = { variants: [variant] };
  expect(validRecipe(recipe, manifest, budget)).toEqual(recipe);
  for (const invalid of [
    { variants: [{ ...variant, name: 'original' }] },
    { variants: [variant, variant] },
    { variants: [{ ...variant, name: 'Bad name' }] },
    { variants: [{ ...variant, quality: 0 }] },
    { variants: [{ ...variant, width: 101 }] },
    { variants: [{ ...variant, height: 101 }] },
    { variants: [{ ...variant, fit: 'invalid' }] },
    { ...recipe, crop: { left: 39, top: 0, width: 2, height: 2 } },
    { ...recipe, crop: { left: 0, top: 29, width: 2, height: 2 } },
  ])
    expect(validRecipe(invalid, manifest, budget)).toBeNull();
  expect(validRecipe(recipe, manifest, { ...budget, maxPixels: 199 })).toBeNull();
  expect(validRecipe(recipe, manifest, { ...budget, maxVariants: 0 })).toBeNull();
  expect(
    validRecipe(
      { ...recipe, crop: { left: 0, top: 0, width: 1, height: 1 } },
      { ...manifest, width: null },
      budget,
    ),
  ).toBeNull();
  expect(variantDrafts({ variants: [variant] }, () => first)).toEqual([
    {
      id: first,
      name: 'thumb',
      width: '20',
      height: '10',
      fit: 'cover',
      format: 'png',
      quality: '90',
    },
  ]);
});
it('keeps Blob URLs scoped to live subscribers and revokes the last URL exactly once', () => {
  const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  const create = vi.fn<(value: Blob | MediaSource) => string>().mockReturnValue('blob:private');
  const revoke = vi.fn<(url: string) => void>();
  URL.createObjectURL = create;
  URL.revokeObjectURL = revoke;
  try {
    const resource = createBlobResource(new Blob(['private']));
    const listener = vi.fn<() => void>();
    const firstStop = resource.subscribe(listener);
    const secondStop = resource.subscribe(() => {});
    expect(resource.getSnapshot()).toBe('blob:private');
    expect(create).toHaveBeenCalledTimes(1);
    firstStop();
    expect(revoke).not.toHaveBeenCalled();
    secondStop();
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:private');
    expect(resource.getSnapshot()).toBeNull();
    const stop = resource.subscribe(listener);
    stop();
    expect(create).toHaveBeenCalledTimes(2);
    expect(revoke).toHaveBeenCalledTimes(2);
    const empty = createBlobResource(null);
    const release = empty.subscribe(listener);
    release();
    expect(empty.getSnapshot()).toBeNull();
  } finally {
    if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
    else Reflect.deleteProperty(URL, 'createObjectURL');
    if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
    else Reflect.deleteProperty(URL, 'revokeObjectURL');
  }
});
it('validates safe wire projections for uploads, jobs, cleanup and resource references without provider internals', () => {
  expect(assetManifestSchema.parse({ ...manifest, storageKey: 'secret' })).not.toHaveProperty(
    'storageKey',
  );
  const { manifest: _manifest, ...summary } = session();
  expect(
    uploadPageSchema.safeParse({ rows: [summary], total: 1, page: 1, pageSize: 20 }).success,
  ).toBe(true);
  const job = {
    id: second,
    kind: 'asset',
    collection: 'images',
    action: 'reprocess',
    status: 'running',
    attempts: 1,
    failureCode: null,
    uploadId: first,
    documentId: first,
    createdAt: '2026-10-26T00:00:00.000Z',
    finishedAt: null,
  };
  expect(
    jobSummaryPageSchema.safeParse({ rows: [job], total: 1, page: 1, pageSize: 20 }).success,
  ).toBe(true);
  expect(jobResultSchema.safeParse({ ...job, manifest }).success).toBe(true);
  expect(
    jobSummaryPageSchema.safeParse({
      rows: [{ ...job, status: 'partial' }],
      total: 1,
      page: 1,
      pageSize: 20,
    }).success,
  ).toBe(false);
  expect(
    cleanupRetryReceiptSchema.safeParse({
      id: first,
      accepted: true,
      location: `/v1/asset-cleanups/${first}`,
    }).success,
  ).toBe(true);
  expect(
    cleanupRetryReceiptSchema.safeParse({ id: first, accepted: false, location: '/' }).success,
  ).toBe(false);
  expect(cleanupPageSchema.safeParse({ rows: [], total: 0, page: 0, pageSize: 20 }).success).toBe(
    false,
  );
  expect(
    resourceReferencePageSchema.safeParse({
      rows: [
        { collection: 'pages', id: first, versionId: second, sourcePath: 'en:body.children.0' },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    }).success,
  ).toBe(true);
});
it('normalizes URL filters and sends only the real operation query keys', () => {
  expect(
    parseResourceQuery(new URLSearchParams('page=bad&pageSize=999&q=cat&trashed=bad')),
  ).toEqual({ collection: '', page: 1, pageSize: 20, q: 'cat', trashed: 'false', locale: '' });
  expect(
    resourceRequest(
      parseResourceQuery(new URLSearchParams('collection=images&locale=zh-CN&trashed=true')),
    ),
  ).toEqual({
    page: 1,
    pageSize: 20,
    q: '',
    trashed: true,
    mode: 'editing',
    depth: 0,
    fallback: [],
    locale: 'zh-CN',
  });
  expect(
    resourceRequest(parseResourceQuery(new URLSearchParams('locale=zh-CN'))),
  ).not.toHaveProperty('locale');
  expect(resourceQueryHref(new URLSearchParams('page=4'), { q: 'new' })).toContain('page=1');
  expect(parseCleanupQuery(new URLSearchParams('blocked=no&state=wrong&page=-1')).blocked).toBe(
    'true',
  );
  expect(cleanupQueryHref(new URLSearchParams('page=5'), { blocked: 'false' })).toContain('page=1');
  const work = parseWorkQuery(
    new URLSearchParams(
      `view=uploads&status=ready&action=batch&documentId=${first}&selected=${second}`,
    ),
  );
  expect(workFilters(work)).toEqual({ page: 1, pageSize: 20, status: 'ready', documentId: first });
  expect(workFilters({ ...work, view: 'jobs', status: 'running', action: 'publication' })).toEqual({
    page: 1,
    pageSize: 20,
    status: 'running',
    documentId: first,
    action: 'publication',
  });
  expect(parseWorkQuery(new URLSearchParams('view=jobs&status=ready')).status).toBe('');
  expect(
    workQueryHref(new URLSearchParams('page=4'), { collection: 'images', view: 'uploads' }),
  ).toContain('page=1');
});
