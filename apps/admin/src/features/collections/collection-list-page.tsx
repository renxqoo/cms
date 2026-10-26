'use client';
import { useSearchParams } from 'next/navigation';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from '@new-cms/ui/layout';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { AppLink } from '../../components/shell/navigation/app-link';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useQueryNavigation } from '../../components/shell/navigation/use-query-navigation';
import { useShell } from '../../components/shell/shell-provider';
import { collectionSchema, documentListSchema } from '../../contracts/content';
import type { Collection } from '../../contracts/content';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { contentMessages } from './content-messages';
import type { ContentMessages } from './content-messages';
import { collectionPath, collectionScope, documentPath } from './content-policy';
import { parseContentQuery, contentApiQuery, changeContentQuery } from './content-query';
import type { ContentQuery } from './content-query';
import { ContentListPanel } from './content-list-panel';
import { FolderManager } from './folder-manager';
export function CollectionListPage({ collection }: { collection: string }) {
  const access = useAccessControl();
  const t = contentMessages[useShell((state) => state.locale)];
  const catalog = useApiQuery({
    operation: 'collections.get',
    params: { collection },
    response: collectionSchema,
    enabled: access.can('collections.get', collectionScope(collection)),
  });
  return (
    <ClientInteractionBoundary className="space-y-5">
      <ManagementFeedback error={catalog.error} onRetry={catalog.reload} />
      {catalog.data ? (
        <CollectionDocuments collection={catalog.data} messages={t} />
      ) : (
        <Banner>{catalog.phase === 'loading' ? t.loading : t.unavailable}</Banner>
      )}
    </ClientInteractionBoundary>
  );
}
function CollectionDocuments({
  collection,
  messages: t,
}: {
  collection: Collection;
  messages: ContentMessages;
}) {
  const access = useAccessControl();
  const navigation = useAppNavigation();
  const params = useSearchParams();
  const [search, update] = useQueryNavigation(params.toString());
  const query = parseContentQuery(new URLSearchParams(search), collection);
  const can = (operation: string) => access.can(operation, collectionScope(collection.key));
  const result = useApiQuery({
    operation: 'documents.list',
    params: { collection: collection.key },
    query: contentApiQuery(query),
    response: documentListSchema,
    enabled: can('documents.list') && !query.invalid,
  });
  function change(changes: Partial<ContentQuery>) {
    navigation.push(
      update(changes, (current, next) => changeContentQuery(collection, current, next)),
      { scroll: false },
    );
  }
  const singleton = useApiQuery({
    operation: 'documents.list',
    params: { collection: collection.key },
    query: {
      page: 1,
      pageSize: 1,
      locale: query.locale,
      fallback: [],
      depth: 0,
      mode: 'editing',
      trashed: false,
    },
    response: documentListSchema,
    enabled: collection.singleton && can('documents.list'),
  });
  const single = collection.singleton ? singleton.data?.rows[0] : null;
  const canCreate =
    can('documents.create') &&
    can('collections.editor') &&
    can('documents.get') &&
    (!collection.singleton || (singleton.phase === 'ready' && singleton.data?.total === 0));
  const key = JSON.stringify([
    collection.key,
    query.q,
    query.locale,
    query.mode,
    query.trashed,
    query.folderId,
    query.where,
  ]);
  return (
    <div className="space-y-5">
      <PageHeader
        title={collection.label}
        description={t.description}
        actions={
          <>
            <Button variant="outline" onClick={result.reload}>
              {t.refresh}
            </Button>
            {canCreate ? (
              <AppLink
                href={documentPath(collection.key, 'new', query.locale)}
                className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
              >
                {t.create}
              </AppLink>
            ) : null}
            <AppLink href={`${collectionPath(collection.key)}/structure`}>{t.structure}</AppLink>
          </>
        }
      />
      {single && can('documents.get') ? (
        <AppLink
          href={documentPath(collection.key, single.id, query.locale)}
          className="text-primary underline underline-offset-4"
        >
          {t.singleton}
        </AppLink>
      ) : null}
      <ContentListPanel
        key={key}
        collection={collection}
        query={query}
        result={result}
        change={change}
        messages={t}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t.folders}</CardTitle>
        </CardHeader>
        <CardContent>
          <FolderManager collection={collection.key} messages={t} />
        </CardContent>
      </Card>
    </div>
  );
}
