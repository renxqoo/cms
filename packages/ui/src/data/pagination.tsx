'use client';

import type { ReactNode } from 'react';
import { Button } from '../primitives/button.tsx';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (change: { pageSize: number; page: number }) => void;
  pageSizeOptions?: readonly number[];
  pageSizeLabel?: string;
  previousLabel: string;
  nextLabel: string;
  pageLabel: ReactNode;
  totalLabel: ReactNode;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions,
  pageSizeLabel,
  previousLabel,
  nextLabel,
  pageLabel,
  totalLabel,
}: PaginationProps) {
  const lastPage = Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
  const current = Math.min(lastPage, Math.max(1, page));
  function changeSize(value: string) {
    const size = Number(value);
    if (!pageSizeOptions?.includes(size) || size <= 0) return;
    onPageSizeChange?.({ pageSize: size, page: 1 });
  }
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <div className="flex flex-wrap items-center gap-3">
        <span>
          {pageLabel}
          {totalLabel ? <> · {totalLabel}</> : null}
        </span>
        {onPageSizeChange && pageSizeOptions ? (
          <select
            aria-label={pageSizeLabel}
            value={pageSize}
            onChange={(event) => changeSize(event.currentTarget.value)}
            className="h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          disabled={total === 0 || current <= 1}
          onClick={() => onPageChange(current - 1)}
        >
          {previousLabel}
        </Button>
        <Button
          variant="ghost"
          disabled={total === 0 || current >= lastPage}
          onClick={() => onPageChange(current + 1)}
        >
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}
