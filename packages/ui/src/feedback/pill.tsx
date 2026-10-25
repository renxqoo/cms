'use client';

import type { ComponentProps } from 'react';
import { XIcon } from 'lucide-react';
import { cn } from '../cn.ts';
import { Button } from '../primitives/button.tsx';

export interface PillProps extends ComponentProps<'span'> {
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'error';
  dot?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
  disabled?: boolean;
}

export function Pill({
  tone = 'neutral',
  dot = true,
  className,
  children,
  onRemove,
  removeLabel,
  disabled,
  ...props
}: PillProps) {
  return (
    <span
      {...props}
      data-slot="pill"
      data-tone={tone}
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-4xl px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tone === 'neutral' && 'bg-muted text-muted-foreground',
        tone === 'info' && 'bg-primary/10 text-primary',
        tone === 'success' && 'bg-success/10 text-success',
        tone === 'warning' && 'bg-warning/15 text-warning-foreground',
        tone === 'error' && 'bg-destructive/10 text-destructive',
        className,
      )}
    >
      {dot ? (
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      ) : null}
      {children}
      {onRemove && removeLabel ? (
        <Button
          variant="ghost"
          size="icon-xs"
          className="-my-0.5 -mr-1 size-4"
          disabled={disabled}
          onClick={onRemove}
          aria-label={removeLabel}
        >
          <XIcon />
        </Button>
      ) : null}
    </span>
  );
}
