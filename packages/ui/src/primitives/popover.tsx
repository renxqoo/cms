'use client';

import { Popover as BasePopover } from '@base-ui/react/popover';
import { cn } from '../cn.ts';

export const Popover = BasePopover.Root;
export const PopoverTrigger = BasePopover.Trigger;
export const PopoverClose = BasePopover.Close;
export const PopoverTitle = BasePopover.Title;
export const PopoverDescription = BasePopover.Description;

export interface PopoverContentProps
  extends
    BasePopover.Popup.Props,
    Pick<BasePopover.Positioner.Props, 'side' | 'align' | 'sideOffset' | 'alignOffset'> {}

export function PopoverContent({
  className,
  side = 'bottom',
  align = 'start',
  sideOffset = 6,
  alignOffset = 0,
  ...props
}: PopoverContentProps) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className="z-50 outline-none"
      >
        <BasePopover.Popup
          {...props}
          data-slot="popover"
          className={cn(
            'max-h-(--available-height) max-w-(--available-width) min-w-48 origin-(--transform-origin) overflow-y-auto rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none transition-[opacity,transform] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 motion-reduce:transition-none',
            className,
          )}
        />
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}
