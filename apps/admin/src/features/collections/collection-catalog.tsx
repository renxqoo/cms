'use client';
import { FolderOpenIcon } from 'lucide-react';
import { Banner } from '@new-cms/ui/feedback';
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from '@new-cms/ui/layout';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { AppLink } from '../../components/shell/navigation/app-link';
import { useShell } from '../../components/shell/shell-provider';
import { collectionListSchema } from '../../contracts/content';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { contentMessages } from './content-messages';
import { collectionPath, collectionScope } from './content-policy';

export function CollectionCatalog() {
  const t = contentMessages[useShell((state) => state.locale)];
  const access = useAccessControl();
  const result = useApiQuery({
    operation: 'collections.list',
    response: collectionListSchema,
    enabled: access.can('collections.list'),
  });
  return (
    <ClientInteractionBoundary className="space-y-6">
      <PageHeader title={t.title} description={t.description} icon={<FolderOpenIcon />} />
      <ManagementFeedback error={result.error} onRetry={result.reload} />
      {result.phase === 'ready' && result.data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {result.data.rows.map((collection) => (
            <Card key={collection.key}>
              <CardHeader>
                <CardTitle>{collection.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {collection.key} · {collection.mode} · {collection.schemaVersion}
                </p>
                {access.can('documents.list', collectionScope(collection.key)) ? (
                  <AppLink
                    href={collectionPath(collection.key)}
                    className="text-sm text-primary underline underline-offset-4"
                  >
                    {collection.singleton ? t.singleton : collection.label}
                  </AppLink>
                ) : (
                  <Banner>{t.unavailable}</Banner>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Banner>{result.phase === 'loading' ? t.loading : t.unavailable}</Banner>
      )}
    </ClientInteractionBoundary>
  );
}
