import { expect, it } from 'vitest';
import { browserErrorIssues } from '../../test/support/browser-errors.ts';

const url = 'http://127.0.0.1:50100/api/cms/v1/auth/login';
const expectation = { method: 'POST', url, status: 401, count: 1 };
const response = { method: 'POST', url, status: 401, statusText: 'Unauthorized' };
const consoleError = {
  url,
  text: 'Failed to load resource: the server responded with a status of 401 (Unauthorized)',
};

it('requires no console or page errors when a journey registers no HTTP failures', () => {
  expect(
    browserErrorIssues({ expectations: [], responses: [], consoleErrors: [], pageErrors: [] }),
  ).toEqual([]);
  expect(
    browserErrorIssues({
      expectations: [],
      responses: [],
      consoleErrors: [{ url, text: 'Application crashed' }],
      pageErrors: ['Hydration failed'],
    }),
  ).toEqual(['Hydration failed', `Console error at ${url}: Application crashed`]);
});

it('consumes one exact registered HTTP response and its matching Chromium resource error', () => {
  expect(
    browserErrorIssues({
      expectations: [expectation],
      responses: [response],
      consoleErrors: [consoleError],
      pageErrors: [],
    }),
  ).toEqual([]);
});

it('does not swallow application console errors alongside an expected HTTP response', () => {
  expect(
    browserErrorIssues({
      expectations: [expectation],
      responses: [response],
      consoleErrors: [consoleError, { url, text: 'Login render failed' }],
      pageErrors: [],
    }),
  ).toEqual([`Console error at ${url}: Login render failed`]);
});

it('reports extra requests instead of widening the expected HTTP failure count', () => {
  expect(
    browserErrorIssues({
      expectations: [expectation],
      responses: [response, response],
      consoleErrors: [consoleError, consoleError],
      pageErrors: [],
    }),
  ).toHaveLength(2);
});

it.each([{ method: 'GET' }, { url: `${url}/unexpected` }, { status: 403 }])(
  'rejects an HTTP failure with a different request contract: %j',
  (change) => {
    expect(
      browserErrorIssues({
        expectations: [expectation],
        responses: [{ ...response, ...change }],
        consoleErrors: [consoleError],
        pageErrors: [],
      }),
    ).toHaveLength(3);
  },
);

it('fails when the expected HTTP error never occurred', () => {
  expect(
    browserErrorIssues({
      expectations: [expectation],
      responses: [],
      consoleErrors: [],
      pageErrors: [],
    }),
  ).toEqual([`Missing 1 expected HTTP 401: POST ${url}`]);
});
