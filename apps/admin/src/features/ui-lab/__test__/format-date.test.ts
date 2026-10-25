import { expect, it } from 'vitest';
import { formatUtcTimestamp } from '../format-date';

it('English table dates remain identical across server and browser ICU formatting rules', () => {
  expect(formatUtcTimestamp('2026-10-26T08:30:00Z')).toBe('2026-10-26 08:30');
  expect(formatUtcTimestamp('2026-01-02T03:04:00+08:00')).toBe('2026-01-01 19:04');
  expect(formatUtcTimestamp('invalid timestamp')).toBe('—');
});
