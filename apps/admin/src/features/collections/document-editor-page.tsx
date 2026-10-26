'use client';
import { useState } from 'react';
import { flushSync } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { Banner } from '@new-cms/ui/feedback';
import { PageHeader } from '@new-cms/ui/layout';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { UnsavedChangesGuard } from '../../components/cms/unsaved-changes';
import { AppLink } from '../../components/shell/navigation/app-link';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useShell } from '../../components/shell/shell-provider';
import { collectionListSchema } from '../../contracts/content';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { contentMessages } from './content-messages';
import { collectionPath, documentPath, collectionScope } from './content-policy';
import { useEditorResource } from './use-editor-resource';
import { useDocumentChannel } from './use-document-channel';
import type { EditorSnapshot } from './read-editor';
import { documentDirty } from './channel-data';
import { referenceServices } from './field-services';
import { bindingPreview } from './document-media';
import { DocumentWorkspace } from './document-workspace';
export function DocumentEditorPage({ collection, id }: { collection: string; id?: string }) {
  const search = useSearchParams();
  const locale = search.get('locale') ?? undefined;
  const uploadId = !id ? (search.get('uploadId') ?? undefined) : undefined;
  const result = useEditorResource({ collection, id, locale, uploadId });
  const t = contentMessages[useShell((state) => state.locale)];
  return (
    <ClientInteractionBoundary className="space-y-5">
      <ManagementFeedback error={result.error} onRetry={result.reload} />
      {result.data ? (
        <EditorSession
          key={result.key}
          initial={result.data}
          readReady={result.phase === 'ready'}
        />
      ) : (
        <>
          <PageHeader
            title={t.create}
            actions={<AppLink href={collectionPath(collection)}>{t.back}</AppLink>}
          />
          <Banner>{result.phase === 'loading' ? t.loading : t.unavailable}</Banner>
        </>
      )}
    </ClientInteractionBoundary>
  );
}
function EditorSession({ initial, readReady }: { initial: EditorSnapshot; readReady: boolean }) {
  const t = contentMessages[useShell((state) => state.locale)];
  const access = useAccessControl();
  const navigation = useAppNavigation();
  const [redirect, setRedirect] = useState<string | null>(null);
  function navigate(href: string) {
    flushSync(() => setRedirect(href));
    navigation.replace(href);
  }
  const { channel, state } = useDocumentChannel({
    initial,
    readReady,
    onCreated: (id) => navigate(documentPath(initial.collection.key, id, initial.editor.locale)),
    onArchived: () =>
      navigate(
        `${collectionPath(initial.collection.key)}?trashed=true&locale=${encodeURIComponent(initial.editor.locale)}`,
      ),
  });
  const catalog = useApiQuery({
    operation: 'collections.list',
    response: collectionListSchema,
    enabled: access.can('collections.list'),
  });
  const reference = referenceServices(
    catalog.phase === 'ready' ? (catalog.data?.rows ?? []) : [],
    (key) => access.can('documents.list', collectionScope(key)),
    access.reportResult,
  );
  const services = { ...reference, renderPreview: bindingPreview(state.snapshot.document) };
  const dirty =
    documentDirty(state) || state.phase !== 'idle' || Object.keys(state.invalid).length > 0;
  if (redirect) return <Banner>{t.loading}</Banner>;
  return (
    <UnsavedChangesGuard
      dirty={dirty}
      navigation={navigation.adapter}
      labels={{
        title: t.leaveTitle,
        description: t.leaveDescription,
        confirm: t.leave,
        cancel: t.stay,
        close: t.close,
      }}
    >
      <DocumentWorkspace
        channel={channel}
        state={state}
        services={services}
        readReady={readReady}
        messages={t}
        referenceFeedback={<ManagementFeedback error={catalog.error} onRetry={catalog.reload} />}
      />
    </UnsavedChangesGuard>
  );
}
