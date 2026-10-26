'use client';

import { Collapsible as BaseCollapsible } from '@base-ui/react/collapsible';
import { ChevronDownIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface CollapsibleProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  keepMounted?: boolean;
}

export function Collapsible({
  open,
  onOpenChange,
  title,
  children,
  disabled,
  keepMounted,
}: CollapsibleProps) {
  return (
    <BaseCollapsible.Root
      open={open}
      onOpenChange={onOpenChange}
      disabled={disabled}
      className="overflow-hidden rounded-xl border border-border/60"
    >
      <BaseCollapsible.Trigger className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm font-medium outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring data-disabled:opacity-50">
        {title}
        <ChevronDownIcon
          aria-hidden="true"
          className="size-4 transition-transform duration-100 in-data-open:rotate-180 motion-reduce:transition-none"
        />
      </BaseCollapsible.Trigger>
      <BaseCollapsible.Panel
        keepMounted={keepMounted}
        className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 data-starting-style:h-0 data-ending-style:h-0 motion-reduce:transition-none"
      >
        <div className="border-t border-border/60 p-3 text-sm">{children}</div>
      </BaseCollapsible.Panel>
    </BaseCollapsible.Root>
  );
}
