import { fail } from '@new-cms/cms/platform/contracts';
export function ruleResult(value: unknown): boolean {
  if (value instanceof Promise) {
    void value.catch(() => null);
    fail('invalid_input');
  }
  if (typeof value !== 'boolean') fail('invalid_input');
  return value;
}
