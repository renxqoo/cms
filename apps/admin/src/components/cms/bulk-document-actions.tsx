'use client';

import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { ConfirmDialog } from '@new-cms/ui/overlays';
import type { AsyncResult } from '@new-cms/ui/overlays';
import { useCmsAction } from './use-cms-action';
import type { DocumentAction } from './document-actions';

export interface BulkDocumentItem {
  collection: string;
  id: string;
  label: string;
}
export interface BulkDocumentResult {
  collection: string;
  id: string;
  status: 'success' | 'error';
  message?: string;
}
export type BulkActionResult =
  | { status: 'success'; items: readonly BulkDocumentResult[] }
  | { status: 'error'; message: string };

export interface BulkDocumentActionsProps {
  selected: readonly BulkDocumentItem[];
  action: DocumentAction;
  labels: {
    action: string;
    success: string;
    error: string;
    empty: string;
    cancel: string;
    confirmationTitle: string;
    confirmationDescription: string;
    confirm: string;
    close: string;
  };
  onAction(
    this: void,
    action: DocumentAction,
    input: { items: readonly BulkDocumentItem[]; signal: AbortSignal },
  ): Promise<BulkActionResult>;
}

function identity(item: { collection: string; id: string }): string {
  return JSON.stringify([item.collection, item.id]);
}

function validResults(
  selected: readonly BulkDocumentItem[],
  results: readonly BulkDocumentResult[],
): boolean {
  const expected = new Set(selected.map(identity));
  const actual = new Set(results.map(identity));
  return (
    expected.size === selected.length &&
    actual.size === results.length &&
    actual.size === expected.size &&
    [...actual].every((key) => expected.has(key))
  );
}

function BulkDocumentControls({ selected, action, labels, onAction }: BulkDocumentActionsProps) {
  const scope = JSON.stringify([action, selected.map(identity)]);
  const operation = useCmsAction(labels.error, scope);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{
    scope: string;
    items: readonly BulkDocumentResult[];
  } | null>(null);
  const visible = result?.scope === scope ? result.items : [];
  async function apply(signal: AbortSignal): Promise<AsyncResult> {
    const next = await onAction(action, { items: selected, signal });
    if (signal.aborted) return { status: 'error', message: labels.error };
    if (next.status === 'error') return next;
    if (!validResults(selected, next.items)) return { status: 'error', message: labels.error };
    setResult({ scope, items: next.items });
    return { status: 'success' };
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={selected.length === 0 || operation.busy}
          busy={operation.busy}
          onClick={() => {
            if (action === 'delete' || action === 'unpublish') setConfirming(true);
            else void operation.run(apply);
          }}
        >
          {labels.action}
        </Button>
        {operation.busy ? (
          <Button variant="outline" onClick={operation.cancel}>
            {labels.cancel}
          </Button>
        ) : null}
        {selected.length === 0 ? (
          <span className="text-sm text-muted-foreground">{labels.empty}</span>
        ) : null}
      </div>
      {operation.error ? (
        <p role="alert" className="text-sm text-destructive">
          {operation.error}
        </p>
      ) : null}
      {visible.length > 0 ? (
        <ul aria-live="polite" className="space-y-1 text-sm">
          {visible.map((item) => (
            <li
              key={identity(item)}
              className={item.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}
            >
              {selected.find((selectedItem) => identity(selectedItem) === identity(item))?.label}:{' '}
              {item.status === 'success' ? labels.success : (item.message ?? labels.error)}
            </li>
          ))}
        </ul>
      ) : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={labels.confirmationTitle}
        description={labels.confirmationDescription}
        closeLabel={labels.close}
        cancelLabel={labels.cancel}
        submitLabel={labels.confirm}
        errorLabel={labels.error}
        tone={action === 'delete' ? 'destructive' : 'default'}
        onConfirm={({ signal }) => apply(signal)}
      />
    </div>
  );
}

export function BulkDocumentActions(props: BulkDocumentActionsProps) {
  const scope = JSON.stringify([props.action, props.selected.map(identity)]);
  return <BulkDocumentControls key={scope} {...props} />;
}
