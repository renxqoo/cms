import { vi } from 'vitest';
import type { z } from 'zod';
import type { CodeEditorProps } from '@new-cms/ui/forms';
import type * as FormExports from '@new-cms/ui/forms';
import type { Collection } from '../../../contracts/content';
import type { Document } from '../../../contracts/documents';
import { editorIntentSchema } from '../../../contracts/editor';
import type { CollectionEditor } from '../../../contracts/editor';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';

export interface PageRequest {
  operation: string;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
  idempotencyKey?: string;
  signal: AbortSignal;
  response: z.ZodType;
}
const pageApi = vi.hoisted(() => ({
  request: vi.fn<(input: PageRequest) => Promise<ApiResult<unknown>>>(),
  push: vi.fn<(href: string, options?: unknown) => void>(),
  replace: vi.fn<(href: string, options?: unknown) => void>(),
  report: vi.fn<(value: unknown) => void>(),
  refresh: vi.fn<() => void>(),
  denied: new Set<string>(),
  search: '',
  pathname: '/dashboard/collections/articles',
  phase: 'ready' as 'ready' | 'loading' | 'failed',
}));
vi.mock('../../../api/client', () => ({ requestApi: pageApi.request }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({
    principal: { id: '11111111-1111-4111-8111-111111111111', role: { isSuper: false } },
    phase: pageApi.phase,
    error: null,
    can: (operation: string) => pageApi.phase === 'ready' && !pageApi.denied.has(operation),
    reportResult: pageApi.report,
    refresh: pageApi.refresh,
  }),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(pageApi.search),
  usePathname: () => pageApi.pathname,
  useRouter: () => ({ push: pageApi.push, replace: pageApi.replace }),
}));
vi.mock('@new-cms/ui/forms', async () => {
  const actual = await vi.importActual<typeof FormExports>('@new-cms/ui/forms');
  return {
    ...actual,
    CodeEditor: ({ label, value, onChange, readOnly }: CodeEditorProps) => (
      <textarea
        aria-label={label}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    ),
  };
});
vi.mock('../../assets/document-media', () => ({
  DocumentMedia: () => <aside aria-label="Document media" />,
  ReferenceMediaPreview: () => null,
  FixedMedia: () => null,
}));
vi.mock('../../assets/private-file', () => ({ PrivateFile: () => <p>Authorized file preview</p> }));

export const recordId = '11111111-1111-4111-8111-111111111111';
export const secondId = '22222222-2222-4222-8222-222222222222';
export const oldVersion = '33333333-3333-4333-8333-333333333333';
export const newVersion = '44444444-4444-4444-8444-444444444444';
export const date = '2026-10-26T00:00:00.000Z';
export const collection: Collection = {
  key: 'articles',
  label: 'Articles',
  schemaVersion: 1,
  mode: 'drafts',
  history: true,
  singleton: false,
  orderable: false,
  defaultLocale: 'en',
  locales: ['en', 'zh-CN'],
  defaultSort: [{ field: 'updatedAt', order: 'desc' }],
  dataSchema: {},
  behaviorHash: 'behavior',
  mappingFingerprint: 'mapping',
  upload: false,
  fields: [
    {
      id: 'title',
      path: 'title',
      type: 'text',
      label: 'Title',
      required: true,
      localized: true,
      queryable: true,
      sortable: true,
    },
  ],
  drafts: { validate: true, autosave: { intervalMs: 10000 }, schedule: true },
  capabilities: {
    autosave: true,
    publication: true,
    schedules: true,
    history: true,
    trash: true,
    purge: true,
  },
};
export function record(changes: Partial<Document> = {}): Document {
  return {
    id: recordId,
    collection: 'articles',
    revision: 3,
    versionId: newVersion,
    publishedVersionId: oldVersion,
    trashedAt: null,
    folderId: null,
    createdAt: date,
    updatedAt: date,
    data: { title: 'Story', metadata: { count: 1 } },
    ...changes,
  };
}
export function descriptor(
  document: Document | null = record(),
  changes: Partial<CollectionEditor> = {},
): CollectionEditor {
  return {
    collection: 'articles',
    schemaVersion: 1,
    behaviorHash: 'behavior',
    mappingFingerprint: 'mapping',
    intent: document ? 'update' : 'create',
    mode: 'editing',
    locale: 'en',
    fallback: [],
    richTextNodes: [],
    initialData: null,
    initialSnapshot: null,
    visibility: {},
    componentVersions: {},
    document: document
      ? {
          id: document.id,
          revision: document.revision,
          versionId: document.versionId,
          trashedAt: document.trashedAt,
        }
      : null,
    locales: { default: 'en', supported: ['en', 'zh-CN'], fallback: { en: [], 'zh-CN': ['en'] } },
    layout: [
      {
        id: 'title',
        type: 'text',
        name: 'title',
        path: 'title',
        label: 'Title',
        required: true,
        localized: true,
        write: 'allowed',
        constraints: {},
      },
      {
        id: 'metadata',
        type: 'json',
        name: 'metadata',
        path: 'metadata',
        label: 'Metadata',
        required: false,
        localized: false,
        write: 'allowed',
        constraints: {},
      },
    ],
    schemas: { read: {}, draft: {}, commit: {} },
    upload: null,
    actions: (
      [
        'documents.create',
        'documents.update',
        'documents.autosave',
        'documents.publish',
        'documents.unpublish',
        'documents.copy',
        'documents.copyLocale',
        'documents.archive',
        'versions.restore',
        'content.schedulePublication',
      ] as const
    ).map((operationId) => ({ operationId, state: 'allowed' as const })),
    ...changes,
  };
}
export function ok<T>(data: T, status = 200): ApiResult<T> {
  return { ok: true, status, data, requestId: 'page-test' };
}

export function defaultPageRequest(input: PageRequest): Promise<ApiResult<unknown>> {
  const page = { total: 1, page: input.query?.page ?? 1, pageSize: input.query?.pageSize ?? 20 };
  if (input.operation === 'collections.list') return Promise.resolve(ok({ rows: [collection] }));
  if (input.operation === 'collections.get') return Promise.resolve(ok(collection));
  if (input.operation === 'collections.editor')
    return Promise.resolve(
      ok(
        descriptor(input.query?.intent === 'create' ? null : record(), {
          intent: editorIntentSchema.parse(input.query?.intent),
          locale: typeof input.query?.locale === 'string' ? input.query.locale : 'en',
        }),
      ),
    );
  if (input.operation === 'documents.list')
    return Promise.resolve(ok({ ...page, rows: [record()] }));
  if (input.operation === 'documents.get') return Promise.resolve(ok(record()));
  if (input.operation === 'folders.list') return Promise.resolve(ok({ rows: [] }));
  if (input.operation === 'versions.list')
    return Promise.resolve(
      ok({
        ...page,
        total: 2,
        rows: [
          {
            id: oldVersion,
            revision: 1,
            schemaVersion: 1,
            kind: 'create',
            actorId: recordId,
            createdAt: date,
          },
          {
            id: newVersion,
            revision: 3,
            schemaVersion: 1,
            kind: 'save',
            actorId: recordId,
            createdAt: date,
          },
        ],
      }),
    );
  if (input.operation === 'versions.get')
    return Promise.resolve(
      ok({
        ...record({
          versionId: String(input.params?.versionId),
          data: { title: 'Historical title' },
        }),
        schemaVersion: 1,
        kind: 'save',
        actorId: recordId,
      }),
    );
  if (input.operation === 'versions.diff')
    return Promise.resolve(
      ok({
        from: oldVersion,
        to: newVersion,
        changes: [{ field: 'title', before: 'Previous title', after: 'Story' }],
      }),
    );
  return Promise.resolve(failure('not_found', 404));
}
export function resetPageApi() {
  vi.resetAllMocks();
  pageApi.denied.clear();
  pageApi.search = '';
  pageApi.pathname = '/dashboard/collections/articles';
  pageApi.phase = 'ready';
  pageApi.request.mockImplementation(defaultPageRequest);
}

export { pageApi };
