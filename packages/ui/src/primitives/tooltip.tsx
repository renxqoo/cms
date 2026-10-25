'use client';

import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import { useId, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

export interface TooltipProps {
  trigger: ReactElement;
  children: ReactNode;
  delayMs: number;
}

export function Tooltip({ trigger, children, delayMs }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <BaseTooltip.Provider delay={delayMs}>
      <BaseTooltip.Root open={open} onOpenChange={setOpen}>
        <BaseTooltip.Trigger render={trigger} aria-describedby={open ? id : undefined} />
        <BaseTooltip.Portal>
          <BaseTooltip.Positioner sideOffset={6} className="z-50">
            <BaseTooltip.Popup
              role="tooltip"
              id={id}
              className="max-w-72 rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md outline-none transition-opacity duration-100 data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none"
            >
              {children}
            </BaseTooltip.Popup>
          </BaseTooltip.Positioner>
        </BaseTooltip.Portal>
      </BaseTooltip.Root>
    </BaseTooltip.Provider>
  );
}
