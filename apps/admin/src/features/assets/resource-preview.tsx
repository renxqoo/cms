'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@new-cms/ui/overlays';
import { Button } from '@new-cms/ui/actions';
import type { Document } from '../../contracts/documents';
import { referencePageSchema } from '../../contracts/assets';
import { useShell } from '../../components/shell/shell-provider';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { PrivateFile } from './private-file';
import { assetMessages } from './asset-messages';
import { assetUiPolicy } from './policy';

export function ResourcePreview({
  document,
  onClose,
}: {
  document: Document;
  onClose: () => void;
}) {
  const locale = useShell((state) => state.locale);
  const t = assetMessages[locale];
  const access = useAccessControl();
  const navigation = useAppNavigation();
  const [page, setPage] = useState(1);
  const refs = useApiQuery({
    operation: 'resources.references',
    params: { collection: document.collection, id: document.id },
    query: { page, pageSize: assetUiPolicy.pageSize },
    response: referencePageSchema,
    enabled: access.can('resources.references', {
      scopeKind: 'collection',
      collectionKey: document.collection,
    }),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent closeLabel={t.close} className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{document.file?.filename ?? document.id}</DialogTitle>
        </DialogHeader>
        {document.file ? (
          <PrivateFile
            target={{
              collection: document.collection,
              id: document.id,
              versionId: document.versionId,
            }}
            manifest={document.file}
          />
        ) : (
          <p>{t.noFile}</p>
        )}
        <Button
          variant="outline"
          onClick={() =>
            navigation.push(`/dashboard/collections/${document.collection}/${document.id}`)
          }
        >
          {t.open}
        </Button>
        <h3 className="font-medium">{t.references}</h3>
        <ManagementFeedback error={refs.error} onRetry={refs.reload} />
        {refs.data?.total === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noReferences}</p>
        ) : null}
        <ul className="space-y-2">
          {refs.data?.rows.map((reference) => (
            <li key={`${reference.collection}:${reference.id}:${reference.sourcePath}`}>
              <Button
                variant="ghost"
                onClick={() =>
                  navigation.push(`/dashboard/collections/${reference.collection}/${reference.id}`)
                }
              >
                <span className="break-all">
                  {reference.collection}: {reference.id} · {reference.sourcePath}
                </span>
              </Button>
            </li>
          ))}
        </ul>
        {refs.data && refs.data.total > refs.data.pageSize ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              ←
            </Button>
            <span>{page}</span>
            <Button
              variant="outline"
              disabled={page * refs.data.pageSize >= refs.data.total}
              onClick={() => setPage((value) => value + 1)}
            >
              →
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
