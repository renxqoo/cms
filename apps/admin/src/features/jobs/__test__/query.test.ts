import { expect, it } from 'vitest';
import {
  jobsApiQuery,
  jobsQueryHref,
  parseJobsQuery,
  parseCleanupQuery,
  cleanupQueryHref,
} from '../query';

it('keeps job and upload filters in their separate HTTP contracts', () => {
  const jobs = parseJobsQuery(
    new URLSearchParams(
      'collection=articles&page=3&pageSize=50&action=publication&status=queued&purpose=replace&q=secret&sort=provider',
    ),
  );
  expect(jobsApiQuery(jobs)).toEqual({
    page: 3,
    pageSize: 50,
    action: 'publication',
    status: 'queued',
  });
  const uploads = parseJobsQuery(
    new URLSearchParams(
      'tab=uploads&action=batch&status=processing&purpose=replace&documentId=11111111-1111-4111-8111-111111111111',
    ),
  );
  expect(jobsApiQuery(uploads)).toEqual({
    page: 1,
    pageSize: 20,
    status: 'processing',
    purpose: 'replace',
    documentId: '11111111-1111-4111-8111-111111111111',
  });
});

it('rejects invalid pagination, UUIDs, collection keys and cross-kind status filters', () => {
  const parsed = parseJobsQuery(
    new URLSearchParams(
      'collection=../secret&page=-1&pageSize=1000&documentId=bad&jobId=bad&status=ready&action=drop&purpose=unknown',
    ),
  );
  expect(parsed.collection).toBe('');
  expect(parsed.documentId).toBeUndefined();
  expect(parsed.jobId).toBeUndefined();
  expect(parsed.action).toBeUndefined();
  expect(parsed.purpose).toBeUndefined();
  expect(jobsApiQuery(parsed)).toEqual({ page: 1, pageSize: 20 });
  expect(parseJobsQuery(new URLSearchParams('page=9007199254740992&pageSize=0')).page).toBe(1);
});

it('resets pagination for changed filters and drops unknown URL keys', () => {
  const href = jobsQueryHref(
    new URLSearchParams('collection=media&tab=uploads&page=8&purpose=create&unknown=unsafe'),
    { purpose: 'replace', status: 'ready' },
  );
  expect(href).toBe(
    '/dashboard/jobs?collection=media&tab=uploads&page=1&pageSize=20&purpose=replace&status=ready',
  );
  expect(
    jobsQueryHref(new URLSearchParams('collection=articles&page=2&action=publication'), {
      page: 4,
      action: undefined,
    }),
  ).toBe('/dashboard/jobs?collection=articles&tab=jobs&page=4&pageSize=20');
  const id = '11111111-1111-4111-8111-111111111111';
  expect(jobsQueryHref(new URLSearchParams(`collection=articles&jobId=${id}`), {})).toContain(
    `jobId=${id}`,
  );
});

it('uses the blocked-ledger default and preserves explicit all-state pagination', () => {
  expect(
    parseCleanupQuery(new URLSearchParams('state=provider&q=unsafe&page=0&pageSize=101')),
  ).toEqual({ page: 1, pageSize: 20, blocked: true, state: undefined });
  expect(cleanupQueryHref(new URLSearchParams('page=5&state=ready'), { blocked: false })).toBe(
    '/dashboard/asset-cleanups?page=1&pageSize=20&blocked=false&state=ready',
  );
  expect(
    cleanupQueryHref(new URLSearchParams('state=deleted&blocked=false'), {
      page: 3,
      state: undefined,
    }),
  ).toBe('/dashboard/asset-cleanups?page=3&pageSize=20&blocked=false');
});
