'use client';

import { PanelLeftIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../primitives/button.tsx';
import { Link } from './link.tsx';

export function Hamburger({
  expanded,
  onToggle,
  label,
}: {
  expanded: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-expanded={expanded}
      onClick={onToggle}
    >
      <PanelLeftIcon
        className={
          expanded
            ? 'rotate-180 transition-transform duration-100 motion-reduce:transition-none'
            : 'transition-transform duration-100 motion-reduce:transition-none'
        }
      />
    </Button>
  );
}

export interface BreadcrumbItem {
  id: string;
  label: ReactNode;
  href?: string;
}

export function Breadcrumbs({
  label,
  items,
  renderLink,
}: {
  label: string;
  items: readonly BreadcrumbItem[];
  renderLink?: ((item: BreadcrumbItem) => ReactNode) | undefined;
}) {
  return (
    <nav aria-label={label}>
      <ol className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {items.map((item, index) => (
          <li key={item.id} className="inline-flex items-center gap-2">
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {index === items.length - 1 ? (
              <span aria-current="page" className="font-medium text-foreground">
                {item.label}
              </span>
            ) : renderLink ? (
              renderLink(item)
            ) : item.href ? (
              <Link href={item.href} className="hover:text-foreground">
                {item.label}
              </Link>
            ) : (
              <span>{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
