import { z } from 'zod';
import type { createContentSchemaMigrator } from '@new-cms/cms/content/composition';

interface CommandLimits {
  defaultPageSize: number;
  maxPageSize: number;
  maxPages: number;
}
interface BackfillCommand {
  kind: 'backfill';
  collection: string;
  from: number;
  to: number;
  pageSize: number;
  maxPages: number;
  cursor?: string;
}
type SchemaCommand = { kind: 'activate' } | BackfillCommand;
type Migrator = ReturnType<typeof createContentSchemaMigrator>;

function namedArguments(args: readonly string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith('--') || value === undefined || value.startsWith('--') || name in values)
      throw new Error('Invalid schema maintenance arguments');
    values[name] = value;
  }
  return values;
}

export function parseSchemaCommand(args: readonly string[], limits: CommandLimits): SchemaCommand {
  if (args.length === 1 && args[0] === '--activate') return { kind: 'activate' };
  const version = z.coerce
    .number()
    .int()
    .positive()
    .max(2 ** 31 - 1);
  const parsed = z
    .strictObject({
      '--collection': z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
      '--from': version,
      '--to': version,
      '--page-size': z.coerce
        .number()
        .int()
        .positive()
        .max(limits.maxPageSize)
        .default(limits.defaultPageSize),
      '--max-pages': z.coerce
        .number()
        .int()
        .positive()
        .max(limits.maxPages)
        .default(limits.maxPages),
      '--cursor': z.uuid().optional(),
    })
    .parse(namedArguments(args));
  if (parsed['--from'] >= parsed['--to'])
    throw new Error('Target schema must be newer than source schema');
  return {
    kind: 'backfill',
    collection: parsed['--collection'],
    from: parsed['--from'],
    to: parsed['--to'],
    pageSize: parsed['--page-size'],
    maxPages: parsed['--max-pages'],
    ...(parsed['--cursor'] ? { cursor: parsed['--cursor'] } : {}),
  };
}

export async function executeSchemaCommand(
  migrator: Migrator,
  command: SchemaCommand,
  control: { signal: AbortSignal; report(value: unknown): void },
): Promise<{ complete: boolean }> {
  control.signal.throwIfAborted();
  if (command.kind === 'activate') {
    control.report({ type: 'activated', ...(await migrator.activate(control.signal)) });
    return { complete: true };
  }
  let { cursor } = command;
  let processed = 0;
  for (let page = 0; page < command.maxPages; page += 1) {
    control.signal.throwIfAborted();
    const result = await migrator.backfill({
      collection: command.collection,
      from: command.from,
      to: command.to,
      pageSize: command.pageSize,
      signal: control.signal,
      ...(cursor ? { cursor } : {}),
    });
    processed += result.processed;
    control.report({ type: 'backfillPage', ...result, processedTotal: processed });
    if (result.complete) return { complete: true };
    cursor = result.cursor ?? undefined;
  }
  return { complete: false };
}
