import type { LucideIcon } from 'lucide-react';
import { cn } from '../cn.ts';

export interface IconProps {
  icon: LucideIcon;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Icon({ icon: Symbol, label, size = 'md' }: IconProps) {
  return (
    <Symbol
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        'shrink-0',
        size === 'sm' && 'size-3.5',
        size === 'md' && 'size-4',
        size === 'lg' && 'size-5',
      )}
    />
  );
}
