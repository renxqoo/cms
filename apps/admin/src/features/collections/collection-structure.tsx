'use client';
import { Banner } from '@new-cms/ui/feedback';
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from '@new-cms/ui/layout';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { AppLink } from '../../components/shell/navigation/app-link';
import { useShell } from '../../components/shell/shell-provider';
import { collectionSchema } from '../../contracts/content';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { contentMessages } from './content-messages';
import { collectionPath, collectionScope } from './content-policy';
export function CollectionStructure({ collection }: { collection: string }) {
  const t = contentMessages[useShell((state) => state.locale)];
  const access = useAccessControl();
  const result = useApiQuery({
    operation: 'collections.get',
    params: { collection },
    response: collectionSchema,
    enabled: access.can('collections.get', collectionScope(collection)),
  });
  return (
    <ClientInteractionBoundary className="space-y-6">
      <PageHeader
        title={t.structure}
        description={t.safety}
        actions={<AppLink href={collectionPath(collection)}>{t.back}</AppLink>}
      />
      <ManagementFeedback error={result.error} onRetry={result.reload} />
      {result.phase === 'ready' && result.data ? (
        <>
          <dl className="grid gap-4 text-sm md:grid-cols-3">
            {[
              [t.name, result.data.label],
              [t.mode, result.data.mode],
              [t.schema, String(result.data.schemaVersion)],
              [t.behavior, result.data.behaviorHash],
              [t.fingerprint, result.data.mappingFingerprint],
              [t.locales, result.data.locales.join(', ')],
            ].map(([name, value]) => (
              <div key={name}>
                <dt className="text-muted-foreground">{name}</dt>
                <dd className="break-all">{value}</dd>
              </div>
            ))}
          </dl>
          <Card>
            <CardHeader>
              <CardTitle>{t.schema}</CardTitle>
            </CardHeader>
            <CardContent>
              <pre
                className="max-h-[65vh] overflow-auto rounded-lg bg-muted p-4 text-xs"
                tabIndex={0}
              >
                {JSON.stringify(result.data.dataSchema, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </>
      ) : (
        <Banner>{result.phase === 'loading' ? t.loading : t.unavailable}</Banner>
      )}
    </ClientInteractionBoundary>
  );
}
