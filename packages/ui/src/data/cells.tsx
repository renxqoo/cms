import type { ReactNode } from 'react';
import { Pill } from '../feedback/pill.tsx';
import type { PillProps } from '../feedback/pill.tsx';
import { Link } from '../navigation/link.tsx';
import { safeHref } from '../navigation/safe-url.ts';

export function TextCell({
  value,
  emptyLabel,
}: {
  value: string | null | undefined;
  emptyLabel: string;
}) {
  return <span>{value == null || value === '' ? emptyLabel : value}</span>;
}

export function BooleanCell({
  value,
  trueLabel,
  falseLabel,
  emptyLabel,
}: {
  value: boolean | null | undefined;
  trueLabel: string;
  falseLabel: string;
  emptyLabel: string;
}) {
  return <span>{value == null ? emptyLabel : value ? trueLabel : falseLabel}</span>;
}

export function NumberCell({
  value,
  format,
  emptyLabel,
}: {
  value: number | null | undefined;
  format: (value: number) => string;
  emptyLabel: string;
}) {
  return (
    <span className="tabular-nums">
      {value != null && Number.isFinite(value) ? format(value) : emptyLabel}
    </span>
  );
}

export function DateCell({
  value,
  format,
  emptyLabel,
  errorLabel,
}: {
  value: Date | string | null | undefined;
  format: (value: Date) => string;
  emptyLabel: string;
  errorLabel: string;
}) {
  if (value == null || value === '') return <span>{emptyLabel}</span>;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return <span>{errorLabel}</span>;
  return <time dateTime={date.toISOString()}>{format(date)}</time>;
}

export function StatusCell(props: PillProps) {
  return <Pill {...props} />;
}

export function RelationshipCell({
  label,
  href,
  emptyLabel,
  renderLink,
}: {
  label: string | null;
  href?: string | null;
  emptyLabel: string;
  renderLink?: (input: { href: string; label: string }) => ReactNode;
}) {
  if (!label) return <span>{emptyLabel}</span>;
  const url = safeHref(href);
  if (!url) return <span>{label}</span>;
  return renderLink ? (
    renderLink({ href: url, label })
  ) : (
    <Link href={url} className="underline underline-offset-2">
      {label}
    </Link>
  );
}
