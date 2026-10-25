import { expect, it } from 'vitest';
import { e2ePlan } from '../e2e-plan.ts';

it('selects both existing API and browser journeys when no filter is supplied', () => {
  expect(e2ePlan([]).map((target) => target.kind)).toEqual(['api', 'browser']);
});

it('keeps the API runner and its test-name filter for existing specifications', () => {
  const args = ['e2e/user-rbac.spec.ts', '--testNamePattern', 'revoke'];
  expect(e2ePlan(args)).toEqual([{ kind: 'api', args }]);
});

it('routes browser specifications and Playwright filters together', () => {
  const args = ['e2e/admin-ui.browser.spec.ts', '--project', 'production', '--grep', 'dialog'];
  expect(e2ePlan(args)).toEqual([{ kind: 'browser', args }]);
});

it('routes the real application journey through the browser build and process lifecycle', () => {
  const args = ['e2e/admin-application.browser.spec.ts', '--project', 'development'];
  expect(e2ePlan(args)).toEqual([{ kind: 'browser', args }]);
});

it('rejects mixed runners rather than silently ignoring part of the requested journey', () => {
  expect(() => e2ePlan(['e2e/user-rbac.spec.ts', 'e2e/admin-ui.browser.spec.ts'])).toThrow(
    'separate commands',
  );
});
