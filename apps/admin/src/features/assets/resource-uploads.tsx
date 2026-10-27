'use client';
import { useId, useState } from 'react';
import { UploadIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Field, NativeSelect } from '@new-cms/ui/forms';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@new-cms/ui/overlays';
import { collectionListSchema } from '../../contracts/content';
import { collectionEditorSchema } from '../../contracts/editor';
import type { Collection } from '../../contracts/content';
import type { CollectionEditor } from '../../contracts/editor';
import { useShell } from '../../components/shell/shell-provider';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { assetMessages } from './asset-messages';
import { UploadQueue } from './upload-queue';
import { createResourceSaver } from './resource-ingestion';

export function ResourceUploads({
  search,
  busy,
  onBusyChange,
  change,
  onCreated,
}: {
  search: string;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  change: (values: Readonly<Record<string, string | number | boolean | undefined>>) => void;
  onCreated: () => void;
}) {
  const id = useId();
  const locale = useShell((state) => state.locale);
  const t = assetMessages[locale];
  const access = useAccessControl();
  const current = new URLSearchParams(search);
  const [open, setOpen] = useState(() => current.has('uploadId'));
  const { catalog, metadata, uploadCollections, selected } = useUploadCatalog(
    current.get('collection'),
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <UploadIcon aria-hidden="true" />
            {t.upload}
          </Button>
        }
      />
      <DialogContent keepMounted closeLabel={t.close} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.upload}</DialogTitle>
          <DialogDescription>{t.uploadDescription}</DialogDescription>
        </DialogHeader>
        <ManagementFeedback
          error={catalog.error ?? metadata.error}
          onRetry={() => {
            catalog.reload();
            metadata.reload();
          }}
        />
        {uploadCollections.length > 0 ? (
          <Field id={`${id}-collection`} label={t.collection}>
            <NativeSelect
              value={selected?.key ?? ''}
              disabled={busy}
              onChange={(event) =>
                change({ collection: event.currentTarget.value, uploadId: undefined })
              }
            >
              {uploadCollections.map((collection) => (
                <option key={collection.key} value={collection.key}>
                  {collection.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : (
          <p>{t.empty}</p>
        )}
        {selected && metadata.data?.upload && metadata.data.collection === selected.key ? (
          <ResourceUploadQueue
            key={selected.key}
            collection={selected}
            editor={metadata.data}
            onCreated={onCreated}
            disabled={
              !access.can('documents.create', {
                scopeKind: 'collection',
                collectionKey: selected.key,
              }) ||
              !metadata.data.actions.some(
                (action) => action.operationId === 'documents.create' && action.state !== 'denied',
              )
            }
            {...(current.get('uploadId') ? { initialUploadId: current.get('uploadId') ?? '' } : {})}
            onBusyChange={onBusyChange}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function useUploadCatalog(selectedKey: string | null) {
  const access = useAccessControl();
  const catalog = useApiQuery({
    operation: 'collections.list',
    response: collectionListSchema,
    enabled: access.can('collections.list'),
  });
  const uploadCollections = catalog.data?.rows.filter((collection) => collection.upload) ?? [];
  const selected =
    uploadCollections.find((collection) => collection.key === selectedKey) ?? uploadCollections[0];
  const metadata = useApiQuery({
    operation: 'collections.editor',
    params: { collection: selected?.key ?? '' },
    query: { intent: 'create' },
    response: collectionEditorSchema,
    enabled:
      selected !== undefined &&
      access.can('collections.editor', { scopeKind: 'collection', collectionKey: selected.key }),
  });
  return { catalog, metadata, uploadCollections, selected };
}

function ResourceUploadQueue(props: {
  collection: Collection;
  editor: CollectionEditor;
  disabled: boolean;
  initialUploadId?: string;
  onBusyChange: (busy: boolean) => void;
  onCreated: () => void;
}) {
  const [save] = useState(() => createResourceSaver(props));
  const language = useShell((state) => state.locale);
  const t = assetMessages[language];
  if (!props.editor.upload) return null;
  return (
    <UploadQueue
      collection={props.collection.key}
      limits={props.editor.upload}
      purpose="create"
      locale={props.editor.locale}
      disabled={props.disabled}
      onBusyChange={props.onBusyChange}
      onProcessed={save}
      consumedMessage={t.savedToLibrary}
      {...(props.initialUploadId ? { initialUploadId: props.initialUploadId } : {})}
    />
  );
}
