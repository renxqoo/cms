'use client';

import { useState } from 'react';
import type { Document } from '../../contracts/documents';
import { documentSchema, purgeReceiptSchema } from '../../contracts/documents';
import { ManagementDialog } from '../management-shared/management-dialog';
import { ManagementFeedback } from '../management-shared/feedback';
import { useContentMutation } from './use-content-mutation';
import type { ContentMessages } from './messages';

export function TrashAction({
  document,
  action,
  t,
  onClose,
  onCompleted,
}: {
  document: Document;
  action: 'restore' | 'purge';
  t: ContentMessages;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [key] = useState(() => crypto.randomUUID());
  const mutation = useContentMutation();
  return (
    <ManagementDialog
      open
      onClose={onClose}
      title={action === 'restore' ? t.restore : t.purge}
      description={action === 'purge' ? t.purgeWarning : undefined}
      destructive={action === 'purge'}
      submitLabel={t.confirm}
      pending={mutation.pending}
      locked={mutation.locked}
      disabled={mutation.locked}
      feedback={
        <ManagementFeedback
          error={mutation.error}
          {...(mutation.locked ? { onRetry: mutation.retry } : {})}
        />
      }
      onSubmit={() => {
        const input = {
          params: { collection: document.collection, id: document.id },
          body: { revision: document.revision },
          idempotencyKey: key,
        };
        if (action === 'restore')
          void mutation.run(
            { ...input, operation: 'documents.restoreTrash', response: documentSchema },
            onCompleted,
          );
        else
          void mutation.run(
            { ...input, operation: 'documents.purge', response: purgeReceiptSchema },
            onCompleted,
          );
      }}
    >
      <p className="break-all">{document.id}</p>
    </ManagementDialog>
  );
}
