'use client';

import { useSearchParams } from 'next/navigation';
import { Button } from '@new-cms/ui/actions';
import { PageHeader, Card, CardContent } from '@new-cms/ui/layout';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useShell } from '../../components/shell/shell-provider';
import { collectionEditorSchema } from '../../contracts/editor';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { contentMessages } from './messages';
import { collectionHref } from './query';

export function CollectionStructurePage({ collectionKey }: { collectionKey: string }) {
  const locale = useShell((state) => state.locale);
  const t = contentMessages[locale];
  const access = useAccessControl();
  const navigation = useAppNavigation();
  const params = useSearchParams();
  const result = useApiQuery({
    operation: 'collections.editor',
    params: { collection: collectionKey },
    query: { intent: 'create', ...(params.get('locale') ? { locale: params.get('locale') } : {}) },
    response: collectionEditorSchema,
    enabled: access.can('collections.editor', { scopeKind: 'collection', collectionKey }),
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
      {result.data ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
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
                  layout: result.data.layout,
                  schemas: result.data.schemas,
                  locales: result.data.locales,
                },
                null,
                2,
              )}
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </ClientInteractionBoundary>
  );
}
