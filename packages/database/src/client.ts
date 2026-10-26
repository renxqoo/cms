import { Pool } from 'pg';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export interface SqlExecutor {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
}

export interface Database extends SqlExecutor {
  transaction<T>(work: (tx: SqlExecutor) => Promise<T>, signal?: AbortSignal): Promise<T>;
  readOnlyTransaction<T>(work: (tx: SqlExecutor) => Promise<T>, signal?: AbortSignal): Promise<T>;
  close(): Promise<void>;
  orm: NodePgDatabase;
}

export interface DatabaseOptions {
  connectionString: string;
  schema?: string;
  maxConnections?: number;
  statementTimeoutMs?: number;
  lockTimeoutMs?: number;
  connectionTimeoutMs?: number;
  onError?(error: Error): void;
}

function connectionOptions(options: DatabaseOptions): string {
  const schema = options.schema ?? 'public';
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('Invalid database schema');
  const settings = [`-c search_path=${schema},pg_temp`];
  if (options.statementTimeoutMs !== undefined) {
    settings.push(`-c statement_timeout=${options.statementTimeoutMs}`);
  }
  if (options.lockTimeoutMs !== undefined)
    settings.push(`-c lock_timeout=${options.lockTimeoutMs}`);
  return settings.join(' ');
}

function transactionExecutor(client: PoolClient, signal?: AbortSignal) {
  let active = true;
  const executor: SqlExecutor = {
    async query<R extends QueryResultRow>(text: string, values?: unknown[]) {
      if (!active) throw new Error('Transaction is no longer active');
      signal?.throwIfAborted();
      return client.query<R>(text, values);
    },
  };
  return {
    executor,
    close: () => {
      active = false;
    },
  };
}

async function inTransaction<T>(
  pool: Pool,
  work: (tx: SqlExecutor) => Promise<T>,
  options: { signal?: AbortSignal; readOnly?: boolean } = {},
): Promise<T> {
  const { signal, readOnly } = options;
  signal?.throwIfAborted();
  const client = await pool.connect();
  const lease = transactionExecutor(client, signal);
  let destroyed = false;
  const abort = () => {
    lease.close();
    destroyed = true;
    client.release(true);
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    signal?.throwIfAborted();
    await client.query(
      readOnly
        ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'
        : 'BEGIN ISOLATION LEVEL READ COMMITTED',
    );
    let result: T;
    try {
      result = await work(lease.executor);
    } finally {
      lease.close();
    }
    signal?.throwIfAborted();
    const committed = await client.query('COMMIT');
    if (committed.command !== 'COMMIT') throw new Error('Transaction did not commit');
    return result;
  } catch (error) {
    if (!destroyed) await client.query('ROLLBACK');
    throw error;
  } finally {
    lease.close();
    signal?.removeEventListener('abort', abort);
    if (!destroyed) client.release();
  }
}

export function createDatabase(options: DatabaseOptions): Database {
  const pool = new Pool({
    connectionString: options.connectionString,
    options: connectionOptions(options),
    ...(options.maxConnections === undefined ? {} : { max: options.maxConnections }),
    ...(options.connectionTimeoutMs === undefined
      ? {}
      : { connectionTimeoutMillis: options.connectionTimeoutMs }),
  });
  pool.on('error', (error: Error) => options.onError?.(error));
  return {
    orm: drizzle(pool),
    query: (text, values) => pool.query(text, values),
    transaction: (work, signal) => inTransaction(pool, work, signal ? { signal } : {}),
    readOnlyTransaction: (work, signal) =>
      inTransaction(pool, work, { ...(signal ? { signal } : {}), readOnly: true }),
    close: () => pool.end(),
  };
}
