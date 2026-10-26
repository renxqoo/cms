'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileTextIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { PageHeader } from '@new-cms/ui/layout';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useQueryNavigation } from '../../components/shell/navigation/use-query-navigation';
import { useShell } from '../../components/shell/shell-provider';
import { collectionSchema } from '../../contracts/content';
import type { Collection } from '../../contracts/content';
import { documentPageSchema } from '../../contracts/documents';
import type { Document, DocumentPage } from '../../contracts/documents';
import type { DataTableColumn } from '@new-cms/ui/data';
import { folderListSchema } from '../../contracts/folders';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementList, managementListState } from '../management-shared/management-list';
import { ManagementFeedback } from '../management-shared/feedback';
import { FolderManager } from './folder-manager';
import { contentMessages } from './messages';
import type { ContentMessages } from './messages';
import { collectionHref, documentQueryHref, parseDocumentQuery, queryFilter } from './query';
import type { DocumentQuery } from './query';
import { defaultVisibleFields, documentColumns, selectedDocuments } from './document-columns';
import { DocumentListControls } from './list-controls';
import { TrashAction } from './trash-action';
import { BulkDocuments } from './bulk-documents';

export function DocumentListPage({ collectionKey }: { collectionKey: string }) {
  const access = useAccessControl();
  const catalog = useApiQuery({
    operation: 'collections.get',
    params: { collection: collectionKey },
    response: collectionSchema,
    enabled: access.can('collections.get', { scopeKind: 'collection', collectionKey }),
  });
  const locale = useShell((state) => state.locale);
  const t = contentMessages[locale];
  const denied =
    access.phase === 'ready' &&
    !access.can('collections.get', { scopeKind: 'collection', collectionKey });
  return (
    <ClientInteractionBoundary className="space-y-6">
      <ManagementFeedback error={catalog.error} onRetry={catalog.reload} />
      {catalog.data ? (
        <DocumentList key={collectionKey} collection={catalog.data} />
      ) : (
        <PageHeader
          title={collectionKey}
          description={denied ? t.denied : catalog.phase === 'failed' ? t.failed : t.loading}
        />
      )}
    </ClientInteractionBoundary>
  );
}

function documentApiQuery(query: DocumentQuery, collection: Collection) {
  const filter = queryFilter(query, collection);
  return {
    page: query.page,
    pageSize: query.pageSize,
    q: query.q,
    mode: query.mode,
    trashed: query.trashed,
    locale: query.locale,
    fallback: [],
    depth: 0,
    sort: [{ field: query.sort, order: query.order }],
    ...(filter.where ? { where: filter.where } : {}),
    ...(query.folderId !== undefined ? { folderId: query.folderId } : {}),
  };
}

function DocumentList({ collection }: { collection: Collection }) {
  const locale = useShell((state) => state.locale);
  const t = contentMessages[locale];
  const access = useAccessControl();
  const scope = { scopeKind: 'collection', collectionKey: collection.key } as const;
  const router = useAppNavigation();
  const params = useSearchParams();
  const [search, update] = useQueryNavigation(params.toString());
  const query = parseDocumentQuery(new URLSearchParams(search), collection);
  const filter = queryFilter(query, collection);
  const [visible, setVisible] = useState(() => defaultVisibleFields(collection));
  const result = useApiQuery({
    operation: 'documents.list',
    params: { collection: collection.key },
    query: documentApiQuery(query, collection),
    response: documentPageSchema,
    enabled: queryFilter(query, collection).valid && access.can('documents.list', scope),
  });
  const folders = useApiQuery({
    operation: 'folders.list',
    query: { collection: collection.key },
    response: folderListSchema,
    enabled: access.can('folders.list', scope),
  });
  function change(changes: Partial<DocumentQuery>) {
    router.push(
      update(changes, (current, patch) =>
        documentQueryHref(
          collectionHref(collection.key),
          parseDocumentQuery(current, collection),
          patch,
        ),
      ),
      { scroll: false },
    );
  }
  const selectionScope = JSON.stringify([
    query.locale,
    query.mode,
    query.trashed,
    query.q,
    query.filterField,
    query.filterValue,
    query.folderId === undefined ? 'all' : query.folderId,
  ]);
  return (
    <>
      <DocumentListHeader
        collection={collection}
        query={query}
        t={t}
        canCreate={access.can('documents.create', scope)}
        folderAction={
          <FolderManager
            collection={collection.key}
            t={t}
            onChanged={() => {
              folders.reload();
              result.reload();
            }}
          />
        }
      />
      <DocumentListControls
        collection={collection}
        query={query}
        folders={folders.data?.rows ?? null}
        visible={visible}
        setVisible={setVisible}
        t={t}
        change={change}
      />
      <ManagementFeedback error={result.error} onRetry={result.reload} />
      {!filter.valid ? <Banner tone="warning">{t.filterInvalid}</Banner> : null}
      <DocumentListContent
        key={selectionScope}
        collection={collection}
        query={query}
        change={change}
        result={result}
        visible={visible}
      />
    </>
  );
}

function DocumentListContent({
  collection,
  query,
  change,
  result,
  visible,
}: {
  collection: Collection;
  query: DocumentQuery;
  change: (changes: Partial<DocumentQuery>) => void;
  result: ReturnType<typeof useApiQuery<DocumentPage>>;
  visible: string[];
}) {
  const locale = useShell((state) => state.locale);
  const t = contentMessages[locale];
  const access = useAccessControl();
  const scope = { scopeKind: 'collection', collectionKey: collection.key } as const;
  const router = useAppNavigation();
  const filter = queryFilter(query, collection);
  const [selected, setSelected] = useState<Document[]>([]);
  const [bulk, setBulk] = useState(false);
  const [trash, setTrash] = useState<{ document: Document; action: 'restore' | 'purge' } | null>(
    null,
  );
  const columns = documentColumns({
    collection,
    t,
    locale,
    selected,
    visible,
    trashed: query.trashed,
    mode: query.mode,
    select: (document, checked) =>
      setSelected((previous) => selectedDocuments(previous, document, checked)),
    open: (id) =>
      router.push(
        `${collectionHref(collection.key, id)}?locale=${encodeURIComponent(query.locale)}`,
      ),
    trash: (document, action) => setTrash({ document, action }),
    canRestore: access.can('documents.restoreTrash', scope),
    canPurge: access.can('documents.purge', scope),
  });
  const table = managementListState(access.phase, result.phase);
  return (
    <>
      {selected.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <p>
            {t.selected}: {selected.length}
          </p>
          {access.can('content.batch', scope) && access.can('content.getJob', scope) ? (
            <Button variant="outline" onClick={() => setBulk(true)}>
              {t.bulk}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => setSelected([])}>
            {t.cancel}
          </Button>
        </div>
      ) : null}
      <DocumentTable
        result={result}
        collection={collection}
        query={query}
        change={change}
        t={t}
        columns={columns}
        filterValid={filter.valid}
        denied={access.phase === 'ready' && !access.can('documents.list', scope)}
        loading={table.loading}
        failed={table.failed}
      />
      {trash ? (
        <TrashAction
          {...trash}
          t={t}
          onClose={() => setTrash(null)}
          onCompleted={() => {
            setTrash(null);
            setSelected([]);
            result.reload();
          }}
        />
      ) : null}
      {bulk ? (
        <BulkDocuments
          collection={collection}
          documents={selected}
          locale={query.locale}
          trashed={query.trashed}
          t={t}
          onClose={() => setBulk(false)}
          onCompleted={() => {
            setSelected([]);
            result.reload();
          }}
        />
      ) : null}
    </>
  );
}

function DocumentListHeader({
  collection,
  query,
  t,
  canCreate,
  folderAction,
}: {
  collection: Collection;
  query: DocumentQuery;
  t: ContentMessages;
  canCreate: boolean;
  folderAction: ReactNode;
}) {
  const router = useAppNavigation();
  return (
    <PageHeader
      title={`${collection.label} · ${query.trashed ? t.trash : t.active}`}
      description={t.description}
      icon={<FileTextIcon />}
      actions={
        <div className="flex flex-wrap gap-2">
          {folderAction}
          <Button
            variant="outline"
            onClick={() => router.push(collectionHref(collection.key, 'structure'))}
          >
            {t.structure}
          </Button>
          {canCreate && !query.trashed ? (
            <Button
              onClick={() =>
                router.push(
                  `${collectionHref(collection.key, 'new')}?locale=${encodeURIComponent(query.locale)}`,
                )
              }
            >
              {collection.singleton ? t.open : t.create}
            </Button>
          ) : null}
        </div>
      }
    />
  );
}

function DocumentTable({
  result,
  collection,
  query,
  change,
  t,
  columns,
  filterValid,
  denied,
  loading,
  failed,
}: {
  result: ReturnType<typeof useApiQuery<DocumentPage>>;
  collection: Collection;
  query: DocumentQuery;
  change: (patch: Partial<DocumentQuery>) => void;
  t: ContentMessages;
  columns: readonly DataTableColumn<Document>[];
  filterValid: boolean;
  denied: boolean;
  loading: boolean;
  failed: boolean;
}) {
  return (
    <>
      {denied ? (
        <Banner tone="warning">{t.denied}</Banner>
      ) : (
        <ManagementList
          columns={columns}
          rows={filterValid ? (result.data?.rows ?? []) : []}
          rowKey={(document) => document.id}
          page={query.page}
          pageSize={query.pageSize}
          total={result.data?.total ?? 0}
          loading={filterValid && loading}
          error={failed ? t.failed : null}
          query={query.q}
          onSearch={(q) => change({ q })}
          onPageChange={(page) => change({ page })}
          onPageSizeChange={(pageSize) => change({ pageSize })}
          sort={{
            key: collection.fields.some((field) => field.path === query.sort)
              ? `field:${query.sort}`
              : query.sort,
            direction: query.order === 'asc' ? 'asc' : 'desc',
          }}
          onSortChange={(sort) =>
            change({
              sort: sort?.key.replace(/^field:/, '') ?? 'updatedAt',
              order: sort?.direction ?? 'desc',
            })
          }
          onRetry={result.reload}
        />
      )}
    </>
  );
}
