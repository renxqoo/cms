'use client';

import { useSearchParams } from 'next/navigation';
import { Banner } from '@new-cms/ui/feedback';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { useShell } from '../../components/shell/shell-provider';
import { useAccessControl } from '../access-control/provider';
import { contentMessages } from './messages';
import { ContentEditor } from './editor-workspace';

export function DocumentEditorPage({
  collectionKey,
  documentId = null,
}: {
  collectionKey: string;
  documentId?: string | null;
}) {
  const params = useSearchParams();
  const access = useAccessControl();
  const selectedLocale = params.get('locale');
  const locale = selectedLocale === '' ? null : selectedLocale;
  const scope = { scopeKind: 'collection', collectionKey } as const;
  let intent: 'create' | 'update' | 'read' = 'read';
  if (documentId === null) intent = 'create';
  else if (access.can('documents.update', scope)) intent = 'update';
  const enabled =
    access.phase === 'ready' &&
    access.can('collections.get', scope) &&
    access.can('collections.editor', scope) &&
    access.can(documentId ? 'documents.get' : 'documents.create', scope);
  const language = useShell((state) => state.locale);
  const t = contentMessages[language];
  return (
    <ClientInteractionBoundary className="space-y-6">
      {enabled ? (
        <ContentEditor
          key={`${collectionKey}:${documentId}:${locale}:${intent}`}
          collectionKey={collectionKey}
          documentId={documentId}
          locale={locale}
          intent={intent}
          initialUploadId={params.get('uploadId') ?? undefined}
        />
      ) : (
        <Banner tone="warning">{access.phase === 'loading' ? t.loading : t.denied}</Banner>
      )}
    </ClientInteractionBoundary>
  );
}
