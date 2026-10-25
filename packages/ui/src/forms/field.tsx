'use client';

import { createContext, useContext } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { Input as BaseInput } from '@base-ui/react/input';
import { cn } from '../cn.ts';

interface FieldControl {
  id: string;
  name: string;
  required?: boolean | undefined;
  error?: string | undefined;
  describedBy?: string | undefined;
}

export const FormFeedbackContext = createContext<Readonly<Record<string, string>>>({});
const FieldContext = createContext<FieldControl | null>(null);

export interface FieldProps {
  id: string;
  label: ReactNode;
  name?: string;
  description?: ReactNode;
  error?: string | undefined;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({
  id,
  label,
  name = id,
  description,
  error: explicitError,
  required,
  children,
  className,
}: FieldProps) {
  const errors = useContext(FormFeedbackContext);
  const error = explicitError ?? errors[name];
  const describedBy =
    [description ? `${id}-description` : '', error ? `${id}-error` : '']
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <FieldContext.Provider value={{ id, name, required, error, describedBy }}>
      <div data-slot="field" className={cn('flex flex-col gap-2', className)}>
        <label
          htmlFor={id}
          className="flex w-fit items-center gap-1 text-sm leading-snug font-medium"
        >
          {label}
          {required ? (
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
          ) : null}
        </label>
        {children}
        {description ? (
          <p id={`${id}-description`} className="text-sm leading-normal text-muted-foreground">
            {description}
          </p>
        ) : null}
        {error ? (
          <p id={`${id}-error`} data-slot="field-error" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

const inputClasses =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  const field = useContext(FieldContext);
  return (
    <BaseInput
      id={field?.id}
      name={field?.name}
      required={field?.required}
      aria-invalid={field?.error ? true : undefined}
      aria-describedby={field?.describedBy}
      {...props}
      data-slot="input"
      className={cn(inputClasses, className)}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  const field = useContext(FieldContext);
  return (
    <textarea
      id={field?.id}
      name={field?.name}
      required={field?.required}
      aria-invalid={field?.error ? true : undefined}
      aria-describedby={field?.describedBy}
      {...props}
      data-slot="textarea"
      className={cn(inputClasses, 'min-h-24 resize-y', className)}
    />
  );
}

export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  const field = useContext(FieldContext);
  return (
    <select
      id={field?.id}
      name={field?.name}
      required={field?.required}
      aria-invalid={field?.error ? true : undefined}
      aria-describedby={field?.describedBy}
      {...props}
      className={cn(inputClasses, 'w-auto', className)}
    />
  );
}
