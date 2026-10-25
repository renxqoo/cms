export type DatePickerAppearance = 'default' | 'dayAndTime' | 'dayOnly' | 'monthOnly' | 'timeOnly';

export function validDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function projection(value: Date, appearance: DatePickerAppearance): number {
  if (appearance === 'monthOnly') return value.getUTCFullYear() * 12 + value.getUTCMonth();
  if (appearance === 'timeOnly') return value.getUTCHours() * 60 + value.getUTCMinutes();
  if (appearance === 'dayAndTime') return Math.floor(value.getTime() / 60000);
  const copy = new Date(value);
  copy.setUTCHours(0, 0, 0, 0);
  return copy.getTime();
}

export function withinDateBounds(
  value: Date,
  appearance: DatePickerAppearance,
  bounds: { minDate?: Date | undefined; maxDate?: Date | undefined },
): boolean {
  const point = projection(value, appearance);
  return (
    (!bounds.minDate || point >= projection(bounds.minDate, appearance)) &&
    (!bounds.maxDate || point <= projection(bounds.maxDate, appearance))
  );
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

export function pickerMonth(value: Date): string {
  return `${String(value.getUTCFullYear()).padStart(4, '0')}-${twoDigits(value.getUTCMonth() + 1)}`;
}

export function pickerTime(value: Date): string {
  return `${twoDigits(value.getUTCHours())}:${twoDigits(value.getUTCMinutes())}`;
}

export function changePickerMonth(value: string): Date | null {
  const match = /^(\d{4,})-(\d{2})$/.exec(value);
  if (!match?.[1] || !match[2]) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const date = new Date(0);
  date.setUTCFullYear(Number(match[1]), month - 1, 1);
  return validDate(date) ? date : null;
}

export function changePickerTime(value: string, reference: Date): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match?.[1] || !match[2]) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const date = new Date(reference);
  date.setUTCHours(hours, minutes, 0, 0);
  return date;
}

export function changePickerDay(
  day: Date,
  reference: Date,
  appearance: DatePickerAppearance,
): Date {
  const date = new Date(day);
  date.setUTCHours(
    appearance === 'dayAndTime' ? reference.getUTCHours() : 0,
    appearance === 'dayAndTime' ? reference.getUTCMinutes() : 0,
    0,
    0,
  );
  return date;
}
