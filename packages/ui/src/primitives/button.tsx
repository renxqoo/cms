'use client';

import { Button as BaseButton } from '@base-ui/react/button';
import type { VariantProps } from 'class-variance-authority';
import { isValidElement } from 'react';
import { cn } from '../cn.ts';
import { Spinner } from '../feedback/status.tsx';
import { buttonStyles } from './button-styles.ts';

export interface ButtonProps extends BaseButton.Props, VariantProps<typeof buttonStyles> {
  busy?: boolean;
}

export function Button({
  className,
  variant,
  size,
  busy = false,
  disabled,
  nativeButton,
  render,
  children,
  ...props
}: ButtonProps) {
  const native =
    nativeButton ?? (render == null || (isValidElement(render) && render.type === 'button'));
  return (
    <BaseButton
      type="button"
      {...props}
      render={render}
      nativeButton={native}
      disabled={disabled === true || busy}
      aria-busy={busy || undefined}
      data-slot="button"
      className={cn(buttonStyles({ variant, size }), className)}
    >
      {busy ? <Spinner /> : null}
      {children}
    </BaseButton>
  );
}
