'use client';

import { useState } from 'react';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Button } from '../primitives/button.tsx';
import { cn } from '../cn.ts';
import { Input } from './field.tsx';

export interface PasswordInputProps extends Omit<ComponentProps<'input'>, 'type'> {
  showLabel: string;
  hideLabel: string;
}

export function PasswordInput({ showLabel, hideLabel, className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className={cn('pr-9', className)} />
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute top-1/2 right-0.5 -translate-y-1/2"
        aria-label={visible ? hideLabel : showLabel}
        aria-pressed={visible}
        disabled={props.disabled}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </Button>
    </div>
  );
}
