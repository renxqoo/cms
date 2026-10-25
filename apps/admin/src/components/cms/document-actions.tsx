'use client';

import { useState } from 'react';
import { Button, buttonStyles } from '@new-cms/ui/actions';
import { ConfirmDialog } from '@new-cms/ui/overlays';
import type { AsyncResult } from '@new-cms/ui/overlays';
import { safeResourceUrl } from './safe-url';
import { useCmsAction } from './use-cms-action';

export type DocumentAction = 'save' | 'saveDraft' | 'publish' | 'unpublish' | 'delete';

export interface DocumentActionLabels {
  save: string;
  saveDraft: string;
  publish: string;
  unpublish: string;
  delete: string;
  preview: string;
  cancel: string;
  confirm: string;
  close: string;
  error: string;
  confirmationTitle: string;
  confirmationDescription: string;
}

export interface DocumentActionsProps {
  mode: 'create' | 'update';
  draftsEnabled: boolean;
  status: 'draft' | 'published';
  dirty: boolean;
  busy: boolean;
  uploadPending: boolean;
  permissions: { create: boolean; update: boolean; publish: boolean; delete: boolean };
  previewUrl?: string;
  labels: DocumentActionLabels;
  onAction(
    this: void,
    action: DocumentAction,
    input: { signal: AbortSignal },
  ): Promise<AsyncResult>;
}

function availableActions(props: DocumentActionsProps): DocumentAction[] {
  const allowed: DocumentAction[] = [];
  const canWrite = props.mode === 'create' ? props.permissions.create : props.permissions.update;
  if (canWrite) allowed.push(props.draftsEnabled ? 'saveDraft' : 'save');
  if (props.draftsEnabled && canWrite && props.permissions.publish) allowed.push('publish');
  if (
    props.draftsEnabled &&
    props.mode === 'update' &&
    props.status === 'published' &&
    props.permissions.publish
  )
    allowed.push('unpublish');
  if (props.mode === 'update' && props.permissions.delete) allowed.push('delete');
  return allowed;
}

function DocumentActionControls(props: DocumentActionsProps) {
  const operation = useCmsAction(props.labels.error);
  const [confirming, setConfirming] = useState<DocumentAction | null>(null);
  const busy = props.busy || props.uploadPending || operation.busy;
  const preview = safeResourceUrl(props.previewUrl);
  function invoke(action: DocumentAction) {
    if (action === 'delete' || action === 'unpublish') setConfirming(action);
    else void operation.run((signal) => props.onAction(action, { signal }));
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {availableActions(props).map((action) => (
          <Button
            key={action}
            variant={
              action === 'delete' ? 'destructive' : action === 'unpublish' ? 'outline' : 'default'
            }
            disabled={
              busy ||
              (props.mode === 'update' &&
                !props.dirty &&
                (action === 'save' || action === 'saveDraft'))
            }
            onClick={() => invoke(action)}
          >
            {props.labels[action]}
          </Button>
        ))}
        {preview ? (
          <a
            href={preview}
            target="_blank"
            rel="noreferrer"
            className={buttonStyles({ variant: 'outline' })}
          >
            {props.labels.preview}
          </a>
        ) : null}
      </div>
      {operation.error ? (
        <p role="alert" className="text-sm text-destructive">
          {operation.error}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        title={props.labels.confirmationTitle}
        description={props.labels.confirmationDescription}
        closeLabel={props.labels.close}
        cancelLabel={props.labels.cancel}
        submitLabel={props.labels.confirm}
        errorLabel={props.labels.error}
        tone={confirming === 'delete' ? 'destructive' : 'default'}
        submitDisabled={props.busy || props.uploadPending}
        onConfirm={({ signal }) =>
          confirming
            ? props.onAction(confirming, { signal })
            : Promise.resolve({ status: 'error', message: props.labels.error })
        }
      >
        <p className="text-sm">{confirming ? props.labels[confirming] : null}</p>
      </ConfirmDialog>
    </div>
  );
}

export function DocumentActions(props: DocumentActionsProps) {
  const scope = JSON.stringify([
    props.mode,
    props.draftsEnabled,
    props.status,
    props.permissions.create,
    props.permissions.update,
    props.permissions.publish,
    props.permissions.delete,
  ]);
  return <DocumentActionControls key={scope} {...props} />;
}
