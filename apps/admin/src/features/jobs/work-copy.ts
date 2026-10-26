import type { AssetMessages } from '../assets/messages';

export function workStatus(value: string, t: AssetMessages) {
  if (value === 'failed') return t.failedStatus;
  const labels: Readonly<Record<string, string>> = t;
  return Object.hasOwn(labels, value) ? (labels[value] ?? value) : value;
}

export function workAction(value: string, t: AssetMessages) {
  if (value === 'reprocess') return t.reprocessAction;
  const labels: Readonly<Record<string, string>> = t;
  return Object.hasOwn(labels, value) ? (labels[value] ?? value) : value;
}

export function assetDate(value: string | null, locale: 'zh' | 'en') {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(date)
    : value;
}
