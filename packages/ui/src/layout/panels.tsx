import { cloneElement } from 'react';
import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { cn } from '../cn.ts';

export interface PageHeaderProps {
  className?: string;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, description, icon, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex min-w-0 items-center gap-2">
          {icon ? (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
              {icon}
            </span>
          ) : null}
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        </div>
        {description ? (
          <p className={cn('max-w-3xl text-sm text-muted-foreground', icon && 'sm:pl-10')}>
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export function Gutter({ className, ...props }: ComponentProps<'div'>) {
  return <div {...props} className={cn('px-5 md:px-6 lg:px-8 xl:px-10', className)} />;
}

export function Card({
  className,
  render,
  children,
  ...props
}: ComponentProps<'div'> & {
  render?: ReactElement<{ className?: string; children?: ReactNode }>;
}) {
  const classes = cn(
    'flex flex-col gap-4 rounded-xl bg-card py-4 text-card-foreground ring-1 ring-border/50',
    className,
  );
  if (render)
    return cloneElement(
      render,
      { ...props, className: cn(classes, render.props.className) },
      children,
    );
  return (
    <div {...props} data-slot="card" className={classes}>
      {children}
    </div>
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div {...props} className={cn('flex flex-col gap-1 px-4', className)} />;
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 {...props} className={cn('font-semibold leading-none', className)} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p {...props} className={cn('text-sm text-muted-foreground', className)} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div {...props} className={cn('px-4', className)} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div {...props} className={cn('flex items-center px-4', className)} />;
}

export function ListPanel({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      {...props}
      data-slot="list-panel"
      className={cn(
        'overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-border/50',
        className,
      )}
    />
  );
}

export function ListToolbar({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      className={cn(
        'flex flex-col gap-3 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    />
  );
}

export function ListContent({ className, ...props }: ComponentProps<'div'>) {
  return <div {...props} className={cn('min-w-0', className)} />;
}

export function ListFooter({ className, ...props }: ComponentProps<'footer'>) {
  return (
    <footer
      {...props}
      className={cn(
        'flex min-h-14 items-center border-t border-border/60 bg-muted/20 px-4 py-2',
        className,
      )}
    />
  );
}
