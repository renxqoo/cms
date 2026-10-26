'use client';
import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { Card, CardContent, CardHeader, CardTitle } from '@new-cms/ui/layout';
import type { Document } from '../../contracts/content';
import type { UploadSession } from '../../contracts/assets';
import { useAccessControl } from '../access-control/provider';
import { AssetDocumentControls } from '../assets/asset-document-controls';
import { AssetUploadQueue } from '../assets/asset-upload-queue';
import { AssetPreview } from '../assets/asset-preview';
import type { FieldServices } from '../fields/types';
import { collectionScope } from './content-policy';
import type { DocumentChannel, DocumentChannelState } from './channel-types';
import type { ContentMessages } from './content-messages';
export function bindingPreview(
  document: Document | null,
): NonNullable<FieldServices['renderPreview']> {
  return ({ reference, sourcePath }) => {
    if (!document) return null;
    const binding = document.mediaBindings?.find(
      (item) =>
        item.sourcePath === sourcePath &&
        item.mediaCollectionKey === reference.collection &&
        item.mediaDocumentId === reference.id,
    );
    return binding ? (
      <AssetPreview
        target={{
          kind: 'binding',
          collection: document.collection,
          id: document.id,
          versionId: document.versionId,
          bindingId: binding.bindingId,
          mode: 'editing',
        }}
        manifest={binding.manifest}
        label={binding.manifest.filename}
      />
    ) : null;
  };
}
export function HistoricalFile({ document, label }: { document: Document; label: string }) {
  return document.file ? (
    <AssetPreview
      target={{
        kind: 'document',
        collection: document.collection,
        id: document.id,
        versionId: document.versionId,
        mode: 'editing',
      }}
      manifest={document.file}
      label={label}
    />
  ) : null;
}
export function DocumentMedia({
  channel,
  state,
  readReady,
  messages: t,
}: {
  channel: DocumentChannel;
  state: DocumentChannelState;
  readReady: boolean;
  messages: ContentMessages;
}) {
  const access = useAccessControl();
  const { collection, editor, document } = state.snapshot;
  const budget = editor.upload;
  if (!budget) return null;
  const canWrite =
    access.can('documents.update', collectionScope(collection.key)) ||
    access.can('assets.reprocess', collectionScope(collection.key));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.preview}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {document ? (
          <>
            <HistoricalFile document={document} label={document.file?.filename ?? t.preview} />
            <AssetDocumentControls
              collection={collection.key}
              documentId={document.id}
              versionId={document.versionId}
              revision={document.revision}
              manifest={document.file ?? null}
              budget={budget}
              busy={state.phase !== 'idle'}
              readOnly={!readReady || !canWrite}
              begin={(kind) => channel.beginAsset(kind)}
            />
          </>
        ) : (
          <NewDocumentUpload channel={channel} state={state} readReady={readReady} messages={t} />
        )}
      </CardContent>
    </Card>
  );
}
function NewDocumentUpload({
  channel,
  state,
  readReady,
  messages: t,
}: {
  channel: DocumentChannel;
  state: DocumentChannelState;
  readReady: boolean;
  messages: ContentMessages;
}) {
  const [ready, setReady] = useState<readonly UploadSession[]>([]);
  const access = useAccessControl();
  const { collection, editor, upload } = state.snapshot;
  const budget = editor.upload;
  if (!budget) return null;
  const allowed = readReady && access.can('documents.create', collectionScope(collection.key));
  function available(session: UploadSession) {
    setReady((current) => [...current.filter((item) => item.id !== session.id), session]);
  }
  function terminal(session: UploadSession) {
    setReady((current) => current.filter((item) => item.id !== session.id));
    channel.clearUpload(session.id);
  }
  return (
    <div className="space-y-4">
      <AssetUploadQueue
        collection={collection.key}
        budget={budget}
        purpose="create"
        disabled={!allowed || state.phase !== 'idle'}
        onReady={available}
        onTerminal={terminal}
        onActivityChange={(active) => channel.setUploadActivity(active)}
      />
      {upload ? (
        <Banner>
          {t.uploadReady} {upload.filename}
        </Banner>
      ) : null}
      <ul className="space-y-2">
        {ready.map((session) => (
          <li
            key={session.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
          >
            <span className="break-all">{session.filename}</span>
            <Button
              variant="outline"
              disabled={!allowed || state.phase !== 'idle' || upload?.id === session.id}
              onClick={() => void channel.selectUpload(session.id)}
            >
              {t.apply}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
