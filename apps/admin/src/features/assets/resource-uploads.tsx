'use client';
import { useId } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Field, NativeSelect } from '@new-cms/ui/forms';
import { Card, CardHeader, CardTitle, CardContent } from '@new-cms/ui/layout';
import { collectionListSchema } from '../../contracts/content';
import { collectionEditorSchema } from '../../contracts/editor';
import { useShell } from '../../components/shell/shell-provider';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { assetMessages } from './asset-messages';
import { UploadQueue } from './upload-queue';

export function ResourceUploads({
  search,
  onBusyChange,
  change,
}: {
  search: string;
  onBusyChange: (busy: boolean) => void;
  change: (values: Readonly<Record<string, string | number | boolean | undefined>>) => void;
}) {
  const id = useId();
  const locale = useShell((state) => state.locale);
  const t = assetMessages[locale];
  const access = useAccessControl();
  const navigation = useAppNavigation();
  const current = new URLSearchParams(search);
  const { catalog, metadata, uploadCollections, selected } = useUploadCatalog(
    current.get('collection'),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.upload}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
          <UploadQueue
            key={selected.key}
            collection={selected.key}
            limits={metadata.data.upload}
            purpose="create"
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
            onReady={(session) =>
              navigation.push(`/dashboard/collections/${selected.key}/new?uploadId=${session.id}`)
            }
          />
        ) : null}
        <Button
          variant="outline"
          onClick={() =>
            navigation.push(
              `/dashboard/jobs${selected ? `?collection=${selected.key}&tab=uploads` : ''}`,
            )
          }
        >
          {t.uploadSessions}
        </Button>
      </CardContent>
    </Card>
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
