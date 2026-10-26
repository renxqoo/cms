'use client';

import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { NativeSelect } from '@new-cms/ui/forms';
import { Banner } from '@new-cms/ui/feedback';
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@new-cms/ui/overlays';
import { useShell } from '../../components/shell/shell-provider';
import type { Collection } from '../../contracts/content';
import { collectionEditorSchema } from '../../contracts/editor';
import type { CollectionEditor } from '../../contracts/editor';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { AssetUploadQueue } from './asset-upload-queue';
import { assetMessages } from './messages';

interface UploadDialogProps {
  collections: readonly Collection[];
  initialCollection: string;
  onClose: () => void;
  onStop: () => void;
  onActivityChange: (active: boolean) => void;
}

function matchesCollection(metadata: CollectionEditor | null, collection: Collection) {
  return (
    metadata?.collection === collection.key &&
    metadata.intent === 'create' &&
    metadata.document === null &&
    metadata.schemaVersion === collection.schemaVersion &&
    metadata.behaviorHash === collection.behaviorHash &&
    metadata.mappingFingerprint === collection.mappingFingerprint
  );
}

function UploadCollection({
  collection,
  onActivityChange,
}: {
  collection: Collection;
  onActivityChange: (active: boolean) => void;
}) {
  const access = useAccessControl();
  const t = assetMessages[useShell((state) => state.locale)];
  const allowed =
    access.can('collections.editor', { scopeKind: 'collection', collectionKey: collection.key }) &&
    access.can('documents.create', { scopeKind: 'collection', collectionKey: collection.key });
  const result = useApiQuery({
    operation: 'collections.editor',
    params: { collection: collection.key },
    query: { intent: 'create', mode: 'editing' },
    response: collectionEditorSchema,
    enabled: allowed,
  });
  const metadata = result.data;
  const matches = matchesCollection(metadata, collection);
  return (
    <div className="space-y-3">
      {!allowed ? <Banner tone="warning">{t.denied}</Banner> : null}
      <ManagementFeedback error={result.error} onRetry={result.reload} />
      {metadata?.upload && matches ? (
        <AssetUploadQueue
          collection={collection.key}
          budget={metadata.upload}
          purpose="create"
          disabled={
            !allowed ||
            result.phase !== 'ready' ||
            result.error !== null ||
            !metadata.actions.some(
              (action) => action.operationId === 'documents.create' && action.state !== 'denied',
            )
          }
          onActivityChange={onActivityChange}
        />
      ) : (
        <Banner>{result.phase === 'loading' ? t.loading : t.noBudget}</Banner>
      )}
    </div>
  );
}

export function ResourceUploadDialog(props: UploadDialogProps) {
  const t = assetMessages[useShell((state) => state.locale)];
  const [collection, setCollection] = useState(props.initialCollection);
  const [active, setActive] = useState(false);
  const selected = props.collections.find((row) => row.key === collection);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !active) props.onClose();
      }}
    >
      <DialogContent closeLabel={t.close} showCloseButton={!active} className="sm:max-w-2xl">
        <DialogTitle>{t.upload}</DialogTitle>
        <NativeSelect
          aria-label={t.collection}
          value={collection}
          disabled={active}
          onChange={(event) => setCollection(event.currentTarget.value)}
        >
          <option value="">{t.selectCollection}</option>
          {props.collections.map((row) => (
            <option key={row.key} value={row.key}>
              {row.label}
            </option>
          ))}
        </NativeSelect>
        {selected ? (
          <UploadCollection
            key={selected.key}
            collection={selected}
            onActivityChange={(next) => {
              setActive(next);
              props.onActivityChange(next);
            }}
          />
        ) : (
          <Banner>{t.selectCollection}</Banner>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={active ? props.onStop : props.onClose}>
            {active ? t.stopWaiting : t.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
