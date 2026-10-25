import type { Database, SqlExecutor } from '@new-cms/database/client';
import { CmsError, fail } from './contracts.ts';
import type { CmsPolicy } from './contracts.ts';

export interface SecurityWork<T> {
  mode: 'shared' | 'exclusive';
  work(tx: SqlExecutor): Promise<T>;
  signal?: AbortSignal;
}

function unavailable(error: unknown): never {
  if (error instanceof CmsError) throw error;
  if (error !== null && typeof error === 'object' && 'code' in error) {
    if (error.code === '23505') {
      const constraint = 'constraint' in error ? String(error.constraint) : '';
      fail(constraint.startsWith('endpoint_bindings') ? 'binding_exists' : 'identifier_taken');
    }
    if (error.code === '23503') fail('resource_in_use');
    if (error.code === '23514' || error.code === '23502') fail('invalid_input');
  }
  fail('temporarily_unavailable');
}

export async function securityTransaction<T>(
  database: Database,
  policy: CmsPolicy,
  options: SecurityWork<T>,
): Promise<T> {
  try {
    return await database.transaction(async (tx) => {
      const command =
        options.mode === 'shared' ? 'pg_advisory_xact_lock_shared' : 'pg_advisory_xact_lock';
      await tx.query(`SELECT ${command}($1::bigint)`, [policy.securityLockKey]);
      return options.work(tx);
    }, options.signal);
  } catch (error) {
    return unavailable(error);
  }
}
