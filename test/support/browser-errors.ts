import type { Page } from '@playwright/test';

export interface ExpectedHttpFailure {
  method: string;
  url: string;
  status: number;
  count: number;
}

interface HttpFailure {
  method: string;
  url: string;
  status: number;
  statusText: string;
}

interface ConsoleError {
  text: string;
  url: string;
}

interface BrowserErrors {
  expectations: ExpectedHttpFailure[];
  responses: HttpFailure[];
  consoleErrors: ConsoleError[];
  pageErrors: string[];
}

export function browserErrorIssues(errors: BrowserErrors): string[] {
  const issues = [...errors.pageErrors];
  const remaining = errors.expectations.map((expectation) => ({ ...expectation }));
  const allowedConsole: HttpFailure[] = [];
  for (const response of errors.responses) {
    const expected = remaining.find(
      (entry) =>
        entry.method === response.method &&
        entry.url === response.url &&
        entry.status === response.status &&
        entry.count > 0,
    );
    if (expected) {
      expected.count--;
      allowedConsole.push(response);
    } else issues.push(`Unexpected HTTP ${response.status}: ${response.method} ${response.url}`);
  }
  for (const entry of remaining) {
    if (entry.count > 0)
      issues.push(
        `Missing ${entry.count} expected HTTP ${entry.status}: ${entry.method} ${entry.url}`,
      );
  }
  for (const entry of errors.consoleErrors) {
    const match = allowedConsole.findIndex(
      (response) =>
        response.url === entry.url &&
        entry.text ===
          `Failed to load resource: the server responded with a status of ${response.status} (${response.statusText})`,
    );
    if (match < 0) issues.push(`Console error at ${entry.url}: ${entry.text}`);
    else allowedConsole.splice(match, 1);
  }
  return issues;
}

export function observeBrowserErrors(page: Page) {
  const errors: BrowserErrors = {
    expectations: [],
    responses: [],
    consoleErrors: [],
    pageErrors: [],
  };
  page.on('pageerror', (error) => errors.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error')
      errors.consoleErrors.push({ text: message.text(), url: message.location().url });
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      errors.responses.push({
        method: response.request().method(),
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
      });
  });
  return {
    expectHttpFailure(expectation: ExpectedHttpFailure) {
      if (!Number.isInteger(expectation.count) || expectation.count < 1)
        throw new Error('HTTP error expectations require a positive integer count.');
      errors.expectations.push(expectation);
    },
    issues: () => browserErrorIssues(errors),
  };
}
