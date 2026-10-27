'use client';
import { useContentLocale } from './use-content-locale';

import { DocumentListHeader } from './document-list-header';
import { CollectionViewNavigation, CollectionViewPresentation } from './custom-views';
import { ListSlot } from './list-customization';

import { useState } from 'react';
import { CollectionPresentation } from '../admin-components/collection-presentation';
import { useSearchParams } from 'next/navigation';
import { Banner } from '@new-cms/ui/feedback';
import { PageHeader } from '@new-cms/ui/layout';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useQueryNavigation } from '../../components/shell/navigation/use-query-navigation';
import { useShell } from '../../components/shell/shell-provider';
import { collectionSchema } from '../../contracts/content';
import type { Collection } from '../../contracts/content';
import type { Document, DocumentPage } from '../../contracts/documents';
import { folderListSchema } from '../../contracts/folders';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { contentMessages } from './messages';
import { collectionHref, documentQueryHref, parseDocumentQuery, queryFilter } from './query';
import type { DocumentQuery } from './query';
import { defaultVisibleFields, documentColumns, selectedDocuments } from './document-columns';
import { DocumentListControls } from './list-controls';
import { useDocumentListQuery } from './document-list-query';
import { DocumentTable } from './document-table';
import type { DocumentGroups } from '../../contracts/document-groups';
import { TrashAction } from './trash-action';
import { BulkDocuments } from './bulk-documents';
import { QueryPresetManager } from './query-presets';
import { DocumentHierarchy } from './hierarchy-tree';
import { canBulkDocuments } from './bulk-actions';
import { SelectionActions } from './document-selection-actions';
import { useDocumentOrdering, documentOrderColumn, DocumentOrderFeedback } from './document-order';

export function DocumentListPage({
  collectionKey,
  viewPath,
}: {
  collectionKey: string;
  viewPath?: string | undefined;
}) {
  const contentLocale = useContentLocale();
  const access = useAccessControl();
  const catalog = useApiQuery({
    operation: 'collections.get',
    query: { locale: contentLocale },
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
        <DocumentList key={collectionKey} collection={catalog.data} viewPath={viewPath} />
      ) : (
        <PageHeader
          title={collectionKey}
          description={denied ? t.denied : catalog.phase === 'failed' ? t.failed : t.loading}
        />
      )}
    </ClientInteractionBoundary>
  );
}

function DocumentList({
  collection,
  viewPath,
}: {
  collection: Collection;
  viewPath?: string | undefined;
}) {
  const locale = useShell((state) => state.locale);
  const t = contentMessages[locale];
  const access = useAccessControl();
  const scope = { scopeKind: 'collection', collectionKey: collection.key } as const;
  const router = useAppNavigation();
  const params = useSearchParams();
  const [search, update] = useQueryNavigation(params.toString());
  const query = parseDocumentQuery(new URLSearchParams(search), collection);
  const filter = queryFilter(query, collection);
  const visible = query.columns ?? defaultVisibleFields(collection);
  const { result, groups } = useDocumentListQuery({
    collection,
    query,
    enabled:
      filter.valid &&
      access.can('documents.list', scope) &&
      (!query.groupBy || access.can('documents.groups', scope)),
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
    query.where,
    query.groupBy,
    query.folderId === undefined ? 'all' : query.folderId,
  ]);
  return (
    <CollectionViewPresentation
      scope="collection"
      path={viewPath}
      collection={collection}
      document={null}
      editor={null}
      readOnly={!access.can('documents.create', scope)}
    >
      <CollectionViewNavigation
        scope="collection"
        collection={collection}
        document={null}
        editor={null}
        readOnly={!access.can('documents.create', scope)}
      />
      <CollectionPresentation
        kind="list"
        collection={collection}
        document={null}
        editor={null}
        readOnly={!access.can('documents.create', scope)}
      >
        <DocumentListHeader
          collection={collection}
          query={query}
          t={t}
          canCreate={access.can('documents.create', scope)}
          onFoldersChanged={() => {
            folders.reload();
            result.reload();
          }}
        />
        <DocumentListControls
          collection={collection}
          query={query}
          folders={folders.data?.rows ?? null}
          visible={visible}
          setVisible={(updater) => change({ columns: updater(visible) })}
          t={t}
          change={change}
        />
        <QueryPresetManager
          collection={collection}
          query={query}
          columns={visible}
          onApply={change}
        />
        <ManagementFeedback error={result.error} onRetry={result.reload} />
        {!filter.valid ? <Banner tone="warning">{t.filterInvalid}</Banner> : null}
        <DocumentListContent
          key={selectionScope}
          collection={collection}
          query={query}
          change={change}
          result={result}
          groups={groups}
          visible={visible}
        />
      </CollectionPresentation>
    </CollectionViewPresentation>
  );
}

function DocumentListContent({
  collection,
  query,
  change,
  result,
  groups,
  visible,
}: {
  collection: Collection;
  query: DocumentQuery;
  change: (changes: Partial<DocumentQuery>) => void;
  result: ReturnType<typeof useApiQuery<DocumentPage>>;
  visible: string[];
  groups: DocumentGroups | null;
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
  const ordering = useDocumentOrdering({
    collection,
    query,
    rows: result.data?.rows ?? [],
    onChanged: result.reload,
  });
  const dataColumns = documentColumns({
    collection,
    t,
    locale,
    selected,
    visible,
    trashed: query.trashed,
    mode: query.mode,
    contentLocale: query.locale,
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
  const columns = [...documentOrderColumn(ordering), ...dataColumns];
  const groupColumns = (rows: Document[]) => [
    ...documentOrderColumn({ ...ordering, input: { ...ordering.input, rows } }),
    ...dataColumns,
  ];
  return (
    <>
      <DocumentOrderFeedback
        controller={ordering}
        onSort={() => change({ sort: [{ field: '_order', order: 'asc' }] })}
      />
      <SelectionActions
        count={selected.length}
        t={t}
        clear={() => setSelected([])}
        onBulk={
          canBulkDocuments(collection, query.trashed, access.can) ? () => setBulk(true) : undefined
        }
      />
      <DocumentHierarchy
        collection={collection}
        query={query}
        selected={selected}
        onChanged={() => {
          setSelected([]);
          result.reload();
        }}
      />
      <ListSlot collection={collection} slot="beforeListTable" />
      <DocumentTable
        result={result}
        groups={groups}
        groupColumns={groupColumns}
        collection={collection}
        query={query}
        change={change}
        t={t}
        columns={columns}
        filterValid={filter.valid}
        denied={
          access.phase === 'ready' &&
          (!access.can('documents.list', scope) ||
            Boolean(query.groupBy && !access.can('documents.groups', scope)))
        }
        phase={access.phase}
      />
      <ListSlot collection={collection} slot="afterListTable" />
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
