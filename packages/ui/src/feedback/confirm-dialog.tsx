'use client';

import { FormDialog } from './form-dialog.tsx';
import type { AsyncResult, FormDialogProps } from './form-dialog.tsx';
import type { ReactNode } from 'react';

export interface ConfirmDialogProps extends Omit<FormDialogProps, 'onSubmit' | 'children'> {
  onConfirm: (input: { signal: AbortSignal }) => Promise<AsyncResult>;
  children?: ReactNode;
  tone?: 'default' | 'destructive';
}

export function ConfirmDialog({ onConfirm, children, tone, ...props }: ConfirmDialogProps) {
  return (
    <FormDialog {...props} submitVariant={tone} onSubmit={({ signal }) => onConfirm({ signal })}>
      {children}
    </FormDialog>
  );
}
