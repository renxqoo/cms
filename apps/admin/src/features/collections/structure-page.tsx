'use client';
import { useContentLocale } from './use-content-locale';

import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { PageHeader, Card, CardContent } from '@new-cms/ui/layout';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useShell } from '../../components/shell/shell-provider';
import { collectionSchema } from '../../contracts/content';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { contentMessages } from './messages';
import { collectionHref } from './query';

export function CollectionStructurePage({ collectionKey }: { collectionKey: string }) {
  const contentLocale = useContentLocale();
  const locale = useShell((state) => state.locale);
  const t = contentMessages[locale];
  const access = useAccessControl();
  const navigation = useAppNavigation();
  const result = useApiQuery({
    operation: 'collections.get',
    query: { locale: contentLocale },
    params: { collection: collectionKey },
    response: collectionSchema,
    enabled: access.can('collections.get', { scopeKind: 'collection', collectionKey }),
  });
  return (
    <ClientInteractionBoundary className="space-y-6">
      <PageHeader
        title={t.structure}
        description={collectionKey}
        actions={
          <Button variant="outline" onClick={() => navigation.push(collectionHref(collectionKey))}>
            {t.back}
          </Button>
        }
      />
      <ManagementFeedback error={result.error} onRetry={result.reload} />
      {access.phase === 'ready' &&
      !access.can('collections.get', { scopeKind: 'collection', collectionKey }) ? (
        <Banner tone="warning">{t.denied}</Banner>
      ) : null}
      {result.phase === 'loading' ? <p role="status">{t.loading}</p> : null}
      {result.data ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <h2 className="font-semibold">{t.fields}</h2>
            <dl className="divide-y divide-border">
              {result.data.fields.map((field) => (
                <div key={`${field.path}:${field.id}`} className="grid gap-1 py-3 sm:grid-cols-2">
                  <dt className="break-words font-medium">
                    {field.label}
                    {field.path.includes('.') ? (
                      <span className="mt-1 block break-all text-xs font-normal text-muted-foreground">
                        {field.path}
                      </span>
                    ) : null}
                  </dt>
                  <dd className="text-sm text-muted-foreground">
                    <span>{field.type}</span> · {field.required ? t.required : t.optional} ·{' '}
                    {field.localized
                      ? t.localized
                      : field.path.includes('.')
                        ? t.inheritedLocale
                        : t.shared}
                  </dd>
                </div>
              ))}
            </dl>
            <details>
              <summary className="cursor-pointer rounded-sm text-sm focus-visible:outline-2 focus-visible:outline-ring">
                {t.technicalDetails}
              </summary>
              <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2 text-sm">
                <dt>schemaVersion</dt>
                <dd>{result.data.schemaVersion}</dd>
                <dt>behaviorHash</dt>
                <dd className="break-all">{result.data.behaviorHash}</dd>
                <dt>mappingFingerprint</dt>
                <dd className="break-all">{result.data.mappingFingerprint}</dd>
              </dl>
              <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-4 text-xs">
                {JSON.stringify(
                  {
                    fields: result.data.fields,
                    schema: result.data.dataSchema,
                    locales: result.data.locales,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          </CardContent>
        </Card>
      ) : null}
    </ClientInteractionBoundary>
  );
}
