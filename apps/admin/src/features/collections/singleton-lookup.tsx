'use client';
import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { AppLink } from '../../components/shell/navigation/app-link';
import { documentListSchema } from '../../contracts/content';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { collectionScope, documentPath } from './content-policy';
import type { ContentMessages } from './content-messages';
export function SingletonLookup({
  collection,
  locale,
  messages: t,
}: {
  collection: string;
  locale: string;
  messages: ContentMessages;
}) {
  const access = useAccessControl();
  const [enabled, setEnabled] = useState(false);
  const allowed = access.can('documents.list', collectionScope(collection));
  const result = useApiQuery({
    operation: 'documents.list',
    params: { collection },
    query: {
      page: 1,
      pageSize: 1,
      locale,
      fallback: [],
      depth: 0,
      mode: 'editing',
      trashed: false,
    },
    response: documentListSchema,
    enabled: enabled && allowed,
  });
  function inspect() {
    if (enabled) result.reload();
    else setEnabled(true);
  }
  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        disabled={!allowed}
        busy={result.phase === 'loading'}
        onClick={inspect}
      >
        {t.singleton}
      </Button>
      <ManagementFeedback error={result.error} onRetry={result.reload} />
      {result.phase === 'ready'
        ? result.data?.rows.map((document) => (
            <AppLink
              key={document.id}
              href={documentPath(collection, document.id, locale)}
              className="block break-all text-sm text-primary underline underline-offset-4"
            >
              {t.singleton} · {document.id}
            </AppLink>
          ))
        : null}
      {result.phase === 'ready' && result.data?.total === 0 ? <Banner>{t.empty}</Banner> : null}
    </div>
  );
}
