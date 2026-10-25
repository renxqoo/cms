'use client';

import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { ConfirmDialog } from '@new-cms/ui/overlays';
import type { AsyncResult } from '@new-cms/ui/overlays';

export interface DocumentStateLabels {
  unsaved: string;
  saved: string;
  locked: string;
  owned: string;
  conflict: string;
  takeover: string;
  restore: string;
  confirmationTitle: string;
  confirmationDescription: string;
  confirm: string;
  cancel: string;
  close: string;
  error: string;
}

export interface DocumentStateProps {
  dirty: boolean;
  lock: { ownerName: string; isOwnedByCurrentUser: boolean } | null;
  conflict: boolean;
  labels: DocumentStateLabels;
  onTakeover?(this: void, input: { signal: AbortSignal }): Promise<AsyncResult>;
  onRestore?(this: void, input: { signal: AbortSignal }): Promise<AsyncResult>;
}

function DocumentStateControls({
  dirty,
  lock,
  conflict,
  labels,
  onTakeover,
  onRestore,
}: DocumentStateProps) {
  const [action, setAction] = useState<'takeover' | 'restore' | null>(null);
  const handler = action === 'takeover' ? onTakeover : onRestore;
  return (
    <div className="space-y-3 rounded-xl border border-border/60 p-4 text-sm">
      <p role="status" className="text-muted-foreground">
        {dirty ? labels.unsaved : labels.saved}
      </p>
      {lock ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>
            {lock.isOwnedByCurrentUser ? labels.owned : labels.locked}: {lock.ownerName}
          </span>
          {!lock.isOwnedByCurrentUser && onTakeover ? (
            <Button variant="outline" size="sm" onClick={() => setAction('takeover')}>
              {labels.takeover}
            </Button>
          ) : null}
        </div>
      ) : null}
      {conflict ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-destructive">
          <span>{labels.conflict}</span>
          {onRestore ? (
            <Button variant="outline" size="sm" onClick={() => setAction('restore')}>
              {labels.restore}
            </Button>
          ) : null}
        </div>
      ) : null}
      <ConfirmDialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
        title={labels.confirmationTitle}
        description={labels.confirmationDescription}
        submitLabel={labels.confirm}
        cancelLabel={labels.cancel}
        closeLabel={labels.close}
        errorLabel={labels.error}
        onConfirm={({ signal }) =>
          handler
            ? handler({ signal })
            : Promise.resolve({ status: 'error', message: labels.error })
        }
      >
        <p>{action ? labels[action] : null}</p>
      </ConfirmDialog>
    </div>
  );
}

export function DocumentState(props: DocumentStateProps) {
  const scope = JSON.stringify([
    props.lock?.ownerName,
    props.lock?.isOwnedByCurrentUser,
    props.conflict,
    props.onTakeover !== undefined,
    props.onRestore !== undefined,
  ]);
  return <DocumentStateControls key={scope} {...props} />;
}
