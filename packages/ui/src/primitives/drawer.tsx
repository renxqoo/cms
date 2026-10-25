'use client';

import type { ReactElement, ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog.tsx';
import { cn } from '../cn.ts';

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  closeLabel: string;
  trigger?: ReactElement;
  side?: 'left' | 'right';
  children: ReactNode;
}

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  trigger,
  side = 'right',
  children,
}: DrawerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent
        closeLabel={closeLabel}
        className={cn(
          'top-0 left-auto h-dvh max-h-dvh w-[min(28rem,calc(100vw-2rem))] max-w-none translate-x-0 translate-y-0 rounded-none border-l sm:max-w-none data-starting-style:scale-100 data-ending-style:scale-100',
          side === 'right'
            ? 'right-0 data-starting-style:translate-x-full data-ending-style:translate-x-full'
            : 'left-0 border-r border-l-0 data-starting-style:-translate-x-full data-ending-style:-translate-x-full',
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
