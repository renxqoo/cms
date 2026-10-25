import type { Context } from 'hono';
import { CmsError } from '@new-cms/cms/platform/contracts';
import type { HttpEnvironment } from './contract.ts';

function queryProblem(field: string): CmsError {
  return new CmsError('invalid_input', {
    fieldErrors: [{ field, message: 'Send one valid query parameter value.' }],
  });
}

function pageValue(field: string, value: string | undefined): number {
  if (!value || !/^[1-9]\d*$/.test(value)) throw queryProblem(field);
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw queryProblem(field);
  return number;
}

export function recoveryQueryInput(context: Context<HttpEnvironment>): Record<string, unknown> {
  const values = new Map<string, unknown>();
  for (const [field, entries] of Object.entries(context.req.queries())) {
    if (entries.length !== 1) throw queryProblem(field);
    values.set(
      field,
      field === 'page' || field === 'pageSize' ? pageValue(field, entries[0]) : entries[0],
    );
  }
  return Object.fromEntries(values);
}
