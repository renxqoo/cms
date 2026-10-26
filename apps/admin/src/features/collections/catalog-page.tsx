'use client';

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

export function CollectionCatalogPage() {
  const locale = useShell((state) => state.locale);
  const t = contentMessages[locale];
  const access = useAccessControl();
  const navigation = useAppNavigation();
  const result = useApiQuery({
    operation: 'collections.list',
    response: collectionListSchema,
    enabled: access.can('collections.list'),
  });
  return (
    <ClientInteractionBoundary className="space-y-6">
      <PageHeader title={t.title} description={t.description} icon={<DatabaseIcon />} />
      <ManagementFeedback error={result.error} onRetry={result.reload} />
      {access.phase === 'ready' && !access.can('collections.list') ? (
        <Banner tone="warning">{t.denied}</Banner>
      ) : null}
      {result.phase === 'loading' ? <p role="status">{t.loading}</p> : null}
      {result.phase === 'ready' && result.data?.rows.length === 0 ? (
        <EmptyCatalog onRefresh={result.reload} />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {result.data?.rows.map((collection) => (
          <Card key={collection.key}>
            <CardHeader>
              <CardTitle>{collection.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="break-all text-sm text-muted-foreground">
                {collection.key} · {collection.mode} · v{collection.schemaVersion}
              </p>
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
