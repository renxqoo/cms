'use client';
import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { documentSchema, purgeSchema } from '../../contracts/content';
import type { Document } from '../../contracts/content';
import { useAccessControl } from '../access-control/provider';
import { ManagementDialog } from '../management-shared/management-dialog';
import { ManagementFeedback } from '../management-shared/feedback';
import { collectionScope } from './content-policy';
import { useContentMutation } from './use-content-mutation';
import type { ContentMessages } from './content-messages';
export function TrashActions({
  document,
  onChanged,
  messages: t,
}: {
  document: Document;
  onChanged: () => void;
  messages: ContentMessages;
}) {
  const access = useAccessControl();
  const mutation = useContentMutation(access.reportResult);
  const [action, setAction] = useState<'restoreTrash' | 'purge' | null>(null);
  const scope = collectionScope(document.collection);
  const operation = action === 'purge' ? 'documents.purge' : 'documents.restoreTrash';
  const allowed = access.can(operation, scope) && access.can('documents.list', scope);
  async function perform(retry = false) {
    if (!allowed) return;
    const result = retry
      ? await mutation.retry(allowed)
      : await mutation.run({
          operation,
          params: { collection: document.collection, id: document.id },
          body: { revision: document.revision },
          response: action === 'purge' ? purgeSchema : documentSchema,
          key: 'trash',
        });
    if (result?.ok) {
      setAction(null);
      onChanged();
    }
  }
  return (
    <>
      <div className="flex gap-2">
        {access.can('documents.restoreTrash', scope) ? (
          <Button size="sm" variant="outline" onClick={() => setAction('restoreTrash')}>
            {t.restore}
          </Button>
        ) : null}
        {access.can('documents.purge', scope) ? (
          <Button size="sm" variant="destructive" onClick={() => setAction('purge')}>
            {t.purge}
          </Button>
        ) : null}
      </div>
      {action ? (
        <ManagementDialog
          open
          onClose={() => setAction(null)}
          title={action === 'purge' ? t.purge : t.restore}
          description={action === 'purge' ? t.purgeHint : t.conditional}
          onSubmit={() => void perform()}
          pending={mutation.phase === 'writing'}
          locked={mutation.phase === 'blocked'}
          disabled={!allowed}
          destructive={action === 'purge'}
          submitLabel={action === 'purge' ? t.purge : t.restore}
          feedback={
            <>
              <ManagementFeedback error={mutation.error} />
              {mutation.phase === 'blocked' ? (
                <Button variant="outline" disabled={!allowed} onClick={() => void perform(true)}>
                  {t.retryIntent}
                </Button>
              ) : null}
            </>
          }
        >
          <p className="break-all text-sm">
            {document.id} · {t.revision} {document.revision}
          </p>
        </ManagementDialog>
      ) : null}
    </>
  );
}
