import type { ReactNode } from 'react';

export function WorkValues({ values }: { values: readonly (readonly [string, ReactNode])[] }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {values.map(([label, value]) => (
        <div key={label} className="min-w-0 space-y-1">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-sm break-all">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function workTime(value: string | null, locale: 'zh' | 'en') {
  return value
    ? new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(new Date(value))
    : '—';
}
