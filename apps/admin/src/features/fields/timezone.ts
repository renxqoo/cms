import type { ParsedField } from './parsing';

function localText(epoch: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
  }).formatToParts(epoch);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year').padStart(4, '0')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}:${value('second')}.${value('fractionalSecond')}`;
}

export function zonedDateInput(value: unknown, timezone: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return '';
  try {
    return localText(Date.parse(value), timezone);
  } catch {
    return '';
  }
}

export function parseZonedDate(value: string, timezone: string): ParsedField {
  if (!value) return { valid: true, value: null };
  const source = new Date(`${value}Z`);
  if (
    !Number.isFinite(source.getTime()) ||
    source.toISOString().slice(0, 16) !== value.slice(0, 16)
  )
    return { valid: false, value: null };
  const naive = source.getTime();
  const expected = source.toISOString().slice(0, -1);
  try {
    const offsets = new Set(
      [naive - 86400000, naive, naive + 86400000].map(
        (epoch) => Date.parse(`${localText(epoch, timezone)}Z`) - epoch,
      ),
    );
    const candidates = [...offsets]
      .map((offset) => naive - offset)
      .filter((epoch) => localText(epoch, timezone) === expected)
      .toSorted((a, b) => a - b);
    const [instant] = candidates;
    return instant === undefined
      ? { valid: false, value: null }
      : { valid: true, value: new Date(instant).toISOString() };
  } catch {
    return { valid: false, value: null };
  }
}
