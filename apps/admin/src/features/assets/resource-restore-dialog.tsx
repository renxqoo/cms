'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { requestApi } from '../../api/client';
import { documentSchema } from '../../contracts/content';
import type { Document } from '../../contracts/content';
import { useShell } from '../../components/shell/shell-provider';
import { useAccessControl } from '../access-control/provider';
import { ManagementDialog } from '../management-shared/management-dialog';
import { ManagementFeedback } from '../management-shared/feedback';
import type { ApiFailure } from '../management-shared/query';
import { assetMessages } from './messages';

export function ResourceRestoreDialog({
  resource,
  onClose,
  onRestored,
}: {
  resource: Document;
  onClose: () => void;
  onRestored: () => void;
}) {
  const access = useAccessControl();
  const t = assetMessages[useShell((state) => state.locale)];
  const [error, setError] = useState<ApiFailure | null>(null);
  const [pending, setPending] = useState(false);
  const active = useRef<AbortController | null>(null);
  const key = useRef<string | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const allowed = access.can('documents.restoreTrash', {
    scopeKind: 'collection',
    collectionKey: resource.collection,
  });
  async function restore() {
    if (!allowed || active.current) return;
    key.current ??= crypto.randomUUID();
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    const result = await requestApi({
      operation: 'documents.restoreTrash',
      params: { collection: resource.collection, id: resource.id },
      body: { revision: resource.revision },
      idempotencyKey: key.current,
      response: documentSchema,
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    active.current = null;
    setPending(false);
    access.reportResult(result);
    if (result.ok) {
      onRestored();
      onClose();
    } else setError(result);
  }
  return (
    <ManagementDialog
      open
      title={t.restore}
      onClose={onClose}
      onSubmit={() => void restore()}
      pending={pending}
      locked={error?.uncertain === true}
      disabled={!allowed || pending || error?.error.code === 'version_conflict'}
      submitLabel={t.restore}
      feedback={<ManagementFeedback error={error} />}
      actions={
        error?.uncertain ? (
          <Button variant="outline" disabled={pending} onClick={() => void restore()}>
            {t.verify}
          </Button>
        ) : null
      }
    >
      <p className="break-all text-sm">{resource.file?.filename ?? resource.id}</p>
      <p className="text-sm text-muted-foreground">
        {t.revision}: {resource.revision}
      </p>
    </ManagementDialog>
  );
}
