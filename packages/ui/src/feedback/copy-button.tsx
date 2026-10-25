'use client';

import { CheckIcon, CopyIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../primitives/button.tsx';

export interface CopyButtonProps {
  value: string;
  label: string;
  copiedLabel: string;
  errorLabel: string;
  feedbackDurationMs: number;
  disabled?: boolean;
  writeText?: (text: string) => Promise<void>;
}

export function CopyButton({
  value,
  label,
  copiedLabel,
  errorLabel,
  feedbackDurationMs,
  disabled,
  writeText,
}: CopyButtonProps) {
  const [feedback, setFeedback] = useState<{ value: string; status: 'copied' | 'error' } | null>(
    null,
  );
  const [operation, setOperation] = useState<{ value: string; controller: AbortController } | null>(
    null,
  );
  const active = useRef<{ value: string; controller: AbortController } | null>(null);
  const pending = operation?.value === value && !operation.controller.signal.aborted;
  const visibleFeedback = feedback?.value === value ? feedback.status : null;
  useEffect(() => {
    if (active.current && active.current.value !== value) active.current.controller.abort();
  }, [value]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      active.current?.controller.abort();
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  async function copy() {
    if (active.current?.value === value && !active.current.controller.signal.aborted) return;
    active.current?.controller.abort();
    const controller = new AbortController();
    const request = { value, controller };
    active.current = request;
    if (timer.current !== null) clearTimeout(timer.current);
    setOperation(request);
    let status: 'copied' | 'error' = 'copied';
    try {
      await (writeText ? writeText(value) : navigator.clipboard.writeText(value));
    } catch {
      status = 'error';
    }
    if (controller.signal.aborted || active.current !== request) return;
    active.current = null;
    setOperation(null);
    setFeedback({ value, status });
    timer.current = setTimeout(() => setFeedback(null), Math.max(0, feedbackDurationMs));
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="outline"
        busy={pending}
        disabled={disabled}
        aria-label={label}
        onClick={() => {
          void copy();
        }}
      >
        {visibleFeedback === 'copied' ? <CheckIcon /> : <CopyIcon />}
        {label}
      </Button>
      {visibleFeedback ? (
        <span role="status" className="text-xs text-muted-foreground">
          {visibleFeedback === 'copied' ? copiedLabel : errorLabel}
        </span>
      ) : null}
    </span>
  );
}
