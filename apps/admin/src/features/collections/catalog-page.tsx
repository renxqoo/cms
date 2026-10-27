'use client';
import { useContentLocale } from './use-content-locale';

import { DatabaseIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from '@new-cms/ui/layout';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useShell } from '../../components/shell/shell-provider';
import { collectionListSchema } from '../../contracts/content';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { contentMessages } from './messages';
import { collectionHref } from './query';
import { navigableCollection } from './navigation-model';

export function CollectionCatalogPage() {
  const contentLocale = useContentLocale();
  const locale = useShell((state) => state.locale);
  const t = contentMessages[locale];
  const access = useAccessControl();
  const navigation = useAppNavigation();
  const result = useApiQuery({
    operation: 'collections.list',
    query: { locale: contentLocale },
    response: collectionListSchema,
    enabled: access.can('collections.list'),
  });
  const visible = result.data?.rows.filter(navigableCollection) ?? [];
  return (
    <ClientInteractionBoundary className="space-y-6">
      <PageHeader title={t.title} description={t.description} icon={<DatabaseIcon />} />
      <ManagementFeedback error={result.error} onRetry={result.reload} />
      {access.phase === 'ready' && !access.can('collections.list') ? (
        <Banner tone="warning">{t.denied}</Banner>
      ) : null}
      {result.phase === 'loading' ? <p role="status">{t.loading}</p> : null}
      {result.phase === 'ready' && visible.length === 0 ? (
        <EmptyCatalog onRefresh={result.reload} />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((collection) => (
          <Card key={collection.key}>
            <CardHeader>
              <CardTitle>{collection.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {collection.mode === 'drafts' ? t.draftCollection : t.directCollection}
                {collection.singleton ? ` · ${t.singletonCollection}` : ''}
                {collection.upload ? ` · ${t.mediaCollection}` : ''}
              </p>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
                  {t.technicalDetails}
                </summary>
                <p className="mt-2 break-all">
                  {collection.key} · v{collection.schemaVersion}
                </p>
              </details>
              <Button
                variant="outline"
                onClick={() => navigation.push(collectionHref(collection.key))}
              >
                {t.open}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </ClientInteractionBoundary>
  );
}

function EmptyCatalog({ onRefresh }: { onRefresh: () => void }) {
  const locale = useShell((state) => state.locale);
  const t = contentMessages[locale];
  const access = useAccessControl();
  const navigation = useAppNavigation();
  return (
    <Banner className="space-y-3">
      <p className="font-medium">{t.emptyTitle}</p>
      <p>{t.emptyDescription}</p>
      <div className="flex flex-wrap gap-2">
        {access.can('endpoints.list') && access.can('endpoints.createBinding') ? (
          <Button
            variant="outline"
            onClick={() =>
              navigation.push('/dashboard/endpoints?module=content&accessKind=permission')
            }
          >
            {t.configureEndpoints}
          </Button>
        ) : null}
        {access.can('permissions.list') && access.can('permissions.create') ? (
          <Button variant="outline" onClick={() => navigation.push('/dashboard/permissions')}>
            {t.managePermissions}
          </Button>
        ) : null}
        <Button variant="outline" onClick={onRefresh}>
          {t.refreshCollections}
        </Button>
      </div>
    </Banner>
  );
}
