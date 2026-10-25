'use client';

import { Menu as BaseMenu } from '@base-ui/react/menu';
import { cn } from '../cn.ts';

export const Menu = BaseMenu.Root;
export const MenuTrigger = BaseMenu.Trigger;
export const MenuGroup = BaseMenu.Group;

export function MenuContent({ className, ...props }: BaseMenu.Popup.Props) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner sideOffset={4} align="end" className="z-50">
        <BaseMenu.Popup
          {...props}
          data-slot="menu"
          className={cn(
            'max-h-(--available-height) min-w-36 origin-(--transform-origin) overflow-y-auto rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none transition-[opacity,transform] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none',
            className,
          )}
        />
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

export interface MenuItemProps extends BaseMenu.Item.Props {
  tone?: 'default' | 'destructive';
}

export function MenuItem({ className, tone = 'default', ...props }: MenuItemProps) {
  return (
    <BaseMenu.Item
      {...props}
      data-tone={tone}
      className={cn(
        'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg]:size-4',
        tone === 'destructive' &&
          'text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive',
        className,
      )}
    />
  );
}

export function MenuLabel({ className, ...props }: BaseMenu.GroupLabel.Props) {
  return (
    <BaseMenu.GroupLabel
      {...props}
      className={cn('px-2 py-1 text-xs text-muted-foreground', className)}
    />
  );
}

export function MenuSeparator({ className, ...props }: BaseMenu.Separator.Props) {
  return <BaseMenu.Separator {...props} className={cn('-mx-1 my-1 h-px bg-border', className)} />;
}
