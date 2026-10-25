import { LoaderCircleIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../cn.ts';

export function Spinner({ className, ...props }: ComponentProps<'svg'>) {
  return (
    <LoaderCircleIcon
      aria-hidden="true"
      {...props}
      className={cn('size-4 animate-spin motion-reduce:animate-none', className)}
    />
  );
}

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      {...props}
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)}
    />
  );
}

export interface BannerProps extends ComponentProps<'div'> {
  tone?: 'info' | 'success' | 'warning' | 'error';
}

export function Banner({ tone = 'info', className, ...props }: BannerProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      {...props}
      data-tone={tone}
      className={cn(
        'rounded-lg border p-3 text-sm',
        tone === 'error' && 'border-destructive/30 bg-destructive/5 text-destructive',
        tone === 'warning' && 'border-warning/30 bg-warning/10 text-warning-foreground',
        tone === 'success' && 'border-success/30 bg-success/10 text-success',
        tone === 'info' && 'border-border bg-muted/30',
        className,
      )}
    />
  );
}

export interface PillProps extends ComponentProps<'span'> {
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'error';
  dot?: boolean;
}

export function Pill({ tone = 'neutral', dot = true, className, children, ...props }: PillProps) {
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
    </span>
  );
}
