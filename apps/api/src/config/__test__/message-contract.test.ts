import { expect, it } from 'vitest';
import { interfaceMessageContract, interfaceMessageSeeds } from '../message-contract.ts';

it('validates every bundled software translation against the exact versioned ICU contract', () => {
  expect(interfaceMessageContract.version).toBe('oneaster-ui.v5');
  for (const messages of Object.values(interfaceMessageSeeds))
    expect(interfaceMessageContract.validate(messages)).toBe(true);
});

it('rejects missing namespaces, unknown keys, malformed ICU and mismatched parameters or HTML tags', () => {
  const base = interfaceMessageSeeds['en'];
  if (!base) throw new Error('English initialization bundle missing');
  const { site } = base;
  if (site === null || typeof site !== 'object' || Array.isArray(site))
    throw new Error('Missing site messages');
  for (const change of [
    (data: Record<string, unknown>) => {
      delete data['site'];
    },
    (data: Record<string, unknown>) => {
      data['site'] = { illegal: 'unknown' };
    },
    (data: Record<string, unknown>) => {
      data['site'] = { ...site, brandLine: '{unknown}' };
    },
    (data: Record<string, unknown>) => {
      data['site'] = { ...site, brandLine: '<script>text</script>' };
    },
    (data: Record<string, unknown>) => {
      data['site'] = { ...site, brandLine: '{count, plural, one {x}}' };
    },
    (data: Record<string, unknown>) => {
      data['site'] = { ...site, brandLine: '' };
    },
  ]) {
    const candidate = structuredClone(base);
    change(candidate);
    expect(interfaceMessageContract.validate(candidate)).toBe(false);
  }
});
