'use client';

import { Progress as BaseProgress } from '@base-ui/react/progress';
import { Button } from '../primitives/button.tsx';

export interface ProgressProps {
  value: number | null;
  max: number;
  label: string;
  valueLabel?: string;
}

export function Progress({ value, max, label, valueLabel }: ProgressProps) {
  return (
    <BaseProgress.Root
      value={value}
      max={max}
      aria-label={label}
      aria-valuetext={valueLabel}
      className="grid gap-1.5"
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <BaseProgress.Label>{label}</BaseProgress.Label>
        {valueLabel ? <span>{valueLabel}</span> : null}
      </div>
      <BaseProgress.Track className="h-2 overflow-hidden rounded-full bg-muted">
        <BaseProgress.Indicator className="h-full bg-primary transition-[width] duration-150 data-[status=indeterminate]:w-1/3 data-[status=indeterminate]:animate-pulse motion-reduce:transition-none motion-reduce:animate-none" />
      </BaseProgress.Track>
    </BaseProgress.Root>
  );
}

export function ErrorPill({
  count,
  label,
  onClick,
}: {
  count: number;
  label: string;
  onClick?: () => void;
}) {
  if (count <= 0) return null;
  return (
    <Button variant="destructive" size="xs" onClick={onClick} aria-label={label}>
      <span aria-hidden="true">{count}</span>
      {label}
    </Button>
  );
}
