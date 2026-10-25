'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactElement, ReactNode } from 'react';
import { Button } from '../primitives/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../primitives/dialog.tsx';
import { FormFeedbackContext } from '../forms/field.tsx';
import { useOptionalLoading } from './loading.tsx';

export type AsyncResult =
  | { status: 'success' }
  | { status: 'error'; message: string; fieldErrors?: Readonly<Record<string, string>> };

export interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  closeLabel: string;
  cancelLabel: string;
  submitLabel: string;
  errorLabel: string;
  description?: ReactNode;
  trigger?: ReactElement;
  submitDisabled?: boolean;
  loadingSource?: string;
  submitVariant?: 'default' | 'destructive' | undefined;
  children: ReactNode;
  onSubmit: (input: { signal: AbortSignal; formData: FormData }) => Promise<AsyncResult>;
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  closeLabel,
  cancelLabel,
  submitLabel,
  errorLabel,
  description,
  trigger,
  submitDisabled,
  loadingSource,
  submitVariant,
  children,
  onSubmit,
}: FormDialogProps) {
  const id = useId();
  const loading = useOptionalLoading();
  const releaseLoading = useRef<(() => void) | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const active = useRef<AbortController | null>(null);
  const [operation, setOperation] = useState<{
    controller: AbortController;
    finish: (() => void) | null;
  } | null>(null);
  const [failure, setFailure] = useState<Extract<AsyncResult, { status: 'error' }> | null>(null);
  const visibleFailure = operation?.controller.signal.aborted ? null : failure;
  const pending =
    operation !== null && !operation.controller.signal.aborted && visibleFailure === null;
  useEffect(() => {
    if (!open) {
      operation?.controller.abort();
      operation?.finish?.();
    }
    return () => {
      operation?.controller.abort();
      operation?.finish?.();
    };
  }, [open, operation]);
  useEffect(
    () => () => {
      active.current?.abort();
      releaseLoading.current?.();
    },
    [],
  );
  useEffect(() => {
    if (visibleFailure) summary.current?.focus();
  }, [visibleFailure]);
  function changeOpen(next: boolean) {
    if (!next) {
      active.current?.abort();
      releaseLoading.current?.();
    }
    setFailure(null);
    onOpenChange(next);
  }
  async function submit(formData: FormData) {
    const controller = new AbortController();
    releaseLoading.current = loadingSource ? (loading?.begin(loadingSource) ?? null) : null;
    active.current = controller;
    setOperation({ controller, finish: releaseLoading.current });
    setFailure(null);
    let result: AsyncResult;
    try {
      result = await onSubmit({ signal: controller.signal, formData });
    } catch {
      result = { status: 'error', message: errorLabel };
    }
    if (controller.signal.aborted || active.current !== controller) return;
    active.current = null;
    releaseLoading.current?.();
    if (result.status === 'success') {
      setOperation(null);
      changeOpen(false);
    } else setFailure(result);
  }
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitDisabled || (active.current && !active.current.signal.aborted)) return;
    void submit(new FormData(event.currentTarget));
  }
  function focusField(name: string) {
    const target = form.current?.elements.namedItem(name);
    if (target instanceof HTMLElement) target.focus();
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent closeLabel={closeLabel}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <FormFeedbackContext.Provider value={visibleFailure?.fieldErrors ?? {}}>
          <form
            ref={form}
            id={id}
            onSubmit={handleSubmit}
            className="grid gap-4"
            aria-busy={pending || undefined}
          >
            {visibleFailure ? (
              <div
                ref={summary}
                role="alert"
                tabIndex={-1}
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <p>{visibleFailure.message}</p>
                {visibleFailure.fieldErrors ? (
                  <ul className="mt-1 list-inside list-disc">
                    {Object.entries(visibleFailure.fieldErrors).map(([name, message]) => (
                      <li key={name}>
                        <button
                          type="button"
                          className="text-left underline underline-offset-2"
                          onClick={() => focusField(name)}
                        >
                          {message}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            {children}
          </form>
        </FormFeedbackContext.Provider>
        <DialogFooter>
          <Button variant="outline" onClick={() => changeOpen(false)}>
            {cancelLabel}
          </Button>
          <Button
            type="submit"
            form={id}
            busy={pending}
            disabled={submitDisabled}
            variant={submitVariant}
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
