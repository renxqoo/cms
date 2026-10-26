'use client';

import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { Card, CardContent, CardHeader, CardTitle } from '@new-cms/ui/layout';
import type { Document } from '../../contracts/documents';
import type { Collection } from '../../contracts/content';
import type { CollectionEditor } from '../../contracts/editor';
import { useShell } from '../../components/shell/shell-provider';
import { useAccessControl } from '../access-control/provider';
import { ManagementFeedback } from '../management-shared/feedback';
import { assetMessages } from './asset-messages';
import { UploadQueue } from './upload-queue';
import { PrivateFile } from './private-file';
import { ImageDialog } from './image-dialog';
import { useMediaWrite } from './use-media-write';

export interface DocumentMediaProps {
  collection: Collection;
  editor: CollectionEditor;
  document: Document | null;
  onDocumentChanged: () => void | Promise<void>;
  onUploadReady?: (uploadId: string) => void;
  onBusyChange?: (busy: boolean) => void;
  initialUploadId?: string;
  busy?: boolean;
}

export function DocumentMedia(props: DocumentMediaProps) {
  const locale = useShell((state) => state.locale);
  const t = assetMessages[locale];
  const media = useMediaWrite(props);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.current}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ManagementFeedback error={media.error} />
        {media.uncertain ? (
          <Banner tone="warning">
            <p>{t.unknown}</p>
            <Button
              variant="outline"
              onClick={() => {
                void media.verifyAttachment();
              }}
            >
              {t.resume}
            </Button>
          </Banner>
        ) : null}
        <CurrentMedia props={props} />
        <ReplacementMedia props={props} media={media} />
        <ImageMedia props={props} media={media} />
        <ProcessingResult media={media} />
        {props.document ? <FixedMedia document={props.document} /> : null}
      </CardContent>
    </Card>
  );
}

type MediaState = ReturnType<typeof useMediaWrite>;

function CurrentMedia({ props }: { props: DocumentMediaProps }) {
  const { document, collection, editor } = props;
  const locale = useShell((state) => state.locale);
  const t = assetMessages[locale];
  const canCreate = editor.actions.some(
    (action) => action.operationId === 'documents.create' && action.state !== 'denied',
  );

  return (
    <>
      {document?.file ? (
        <PrivateFile
          key={document.versionId}
          target={{
            collection: collection.key,
            id: document.id,
            versionId: document.versionId,
            mode: editor.mode,
          }}
          manifest={document.file}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{t.noFile}</p>
      )}
      {collection.upload && editor.upload && !document ? (
        <UploadQueue
          collection={collection.key}
          limits={editor.upload}
          purpose="create"
          single
          disabled={props.busy === true || !canCreate}
          onBusyChange={props.onBusyChange}
          {...(props.initialUploadId ? { initialUploadId: props.initialUploadId } : {})}
          onReady={(session) => props.onUploadReady?.(session.id)}
        />
      ) : null}
    </>
  );
}

function ReplacementMedia({ props, media }: { props: DocumentMediaProps; media: MediaState }) {
  const { document, editor, collection } = props;
  const locale = useShell((state) => state.locale);
  const t = assetMessages[locale];
  const access = useAccessControl();
  const allowed =
    document &&
    editor.upload &&
    media.writable &&
    access.can('documents.update', { scopeKind: 'collection', collectionKey: collection.key });
  return (
    <>
      {allowed ? (
        <Button
          variant="outline"
          disabled={media.externalBusy || media.localBusy}
          onClick={() => media.setReplacing(true)}
        >
          {t.replace}
        </Button>
      ) : null}
      {media.replacing && document && editor.upload ? (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">{t.replaceDescription}</p>
          <UploadQueue
            key={`${document.id}:${document.revision}`}
            collection={collection.key}
            limits={editor.upload}
            purpose="replace"
            documentId={document.id}
            revision={document.revision}
            single
            disabled={media.externalBusy || media.uncertain !== null}
            onBusyChange={media.changeBusy}
            onReady={(session) => {
              void media.attach(session);
            }}
          />
          {!media.localBusy ? (
            <Button variant="outline" onClick={() => media.setReplacing(false)}>
              {t.close}
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function ImageMedia({ props, media }: { props: DocumentMediaProps; media: MediaState }) {
  const { document, editor, collection } = props;
  const locale = useShell((state) => state.locale);
  const t = assetMessages[locale];
  const access = useAccessControl();
  const scope = { scopeKind: 'collection' as const, collectionKey: collection.key };
  if (
    !document?.file?.mimeType.startsWith('image/') ||
    !document.file.width ||
    !document.file.height ||
    !editor.upload
  )
    return null;
  const allowed = ['assets.reprocess', 'content.getJob', 'documents.get'].every((operation) =>
    access.can(operation, scope),
  );
  return (
    <>
      {allowed ? (
        <Button
          variant="outline"
          disabled={media.externalBusy || media.localBusy}
          onClick={() => media.setImage(true)}
        >
          {t.image}
        </Button>
      ) : null}
      {media.image ? (
        <ImageDialog
          target={{ collection: collection.key, id: document.id, versionId: document.versionId }}
          manifest={document.file}
          limits={editor.upload}
          onClose={() => media.setImage(false)}
          onProcess={(recipe) => {
            media.setImage(false);
            media.reprocess.start(recipe);
          }}
          busy={false}
        />
      ) : null}
    </>
  );
}

function ProcessingResult({ media }: { media: MediaState }) {
  const locale = useShell((state) => state.locale);
  const t = assetMessages[locale];
  const { reprocess } = media;
  return (
    <>
      <ManagementFeedback error={reprocess.error} />
      {reprocess.phase === 'running' ? <p role="status">{t.processingAccepted}</p> : null}
      {reprocess.phase === 'paused' ? (
        <Banner tone="warning">
          <p>{t.paused}</p>
          <Button variant="outline" onClick={() => reprocess.resume()}>
            {t.resume}
          </Button>
        </Banner>
      ) : null}
      {reprocess.job?.failureCode ? (
        <p role="alert" className="text-sm text-destructive">
          {reprocess.job.failureCode}
        </p>
      ) : null}
    </>
  );
}

export function FixedMedia({ document }: { document: Document }) {
  const locale = useShell((state) => state.locale);
  const bindings =
    document.mediaBindings?.filter((binding) => binding.sourcePath !== '$file') ?? [];
  if (bindings.length === 0) return null;
  return (
    <section className="space-y-3">
      <h3 className="font-medium">{assetMessages[locale].fixedMedia}</h3>
      {bindings.map((binding) => (
        <PrivateFile
          key={binding.bindingId}
          target={{
            collection: document.collection,
            id: document.id,
            versionId: document.versionId,
            bindingId: binding.bindingId,
          }}
          manifest={binding.manifest}
        />
      ))}
    </section>
  );
}

export function ReferenceMediaPreview({
  document,
  reference,
  sourcePath,
}: {
  document: Document;
  reference: { collection: string; id: string };
  sourcePath: string;
}) {
  const binding = document.mediaBindings?.find(
    (value) =>
      value.mediaCollectionKey === reference.collection &&
      value.mediaDocumentId === reference.id &&
      value.sourcePath.slice(value.sourcePath.indexOf(':') + 1) === sourcePath,
  );
  return binding ? (
    <PrivateFile
      target={{
        collection: document.collection,
        id: document.id,
        versionId: document.versionId,
        bindingId: binding.bindingId,
      }}
      manifest={binding.manifest}
    />
  ) : null;
}
