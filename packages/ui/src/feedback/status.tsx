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
