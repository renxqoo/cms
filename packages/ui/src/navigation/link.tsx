import type { ComponentProps } from 'react';
import { cn } from '../cn.ts';
import { safeHref } from './safe-url.ts';

export interface LinkProps extends ComponentProps<'a'> {
  href: string;
}

export function Link({ href, target, rel, children, className, ...props }: LinkProps) {
  const url = safeHref(href);
  if (!url)
    return (
      <span aria-disabled="true" className={className}>
        {children}
      </span>
    );
  return (
    <a
      {...props}
      href={url}
      target={target}
      rel={
        target === '_blank'
          ? [...new Set([...(rel?.split(/\s+/) ?? []), 'noopener', 'noreferrer'])].join(' ')
          : rel
      }
      className={cn(
        'rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {children}
    </a>
  );
}
