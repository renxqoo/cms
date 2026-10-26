import { createHash, randomUUID } from 'node:crypto';
import { CmsError, fail } from '@new-cms/cms/platform/contracts';
import { budgetedExecutor } from '../runtime.ts';
import type { ContentRuntime } from '../types.ts';
import type { ContentDeliveryOptions, DeliverySession } from './types.ts';
import { publicContentContract } from './contracts.ts';
import { sitemapBucket } from './integrity.ts';
import { readLanguages } from './source.ts';
import { exportInput } from './export-input.ts';
import type { ExportInput } from './export-input.ts';
import { allItems } from './export-items.ts';
import { createFrameWriter } from './export-writer.ts';
interface Dependencies {
  runtime: ContentRuntime;
  options: ContentDeliveryOptions;
  active: boolean;
}
interface Execution {
  input: ExportInput;
  writer: ReturnType<typeof createFrameWriter>;
  signal: AbortSignal;
  started: boolean;
}
async function runExport(deps: Dependencies, execution: Execution): Promise<void> {
  const { runtime, options } = deps;
  const { input, writer, signal } = execution;
  await runtime.database.readOnlyTransaction(async (executor) => {
    const tx = budgetedExecutor(executor, options.policy.exportMaxSqlQueries);
    const languages = await readLanguages(runtime, tx);
    const locale = input.locale ?? languages.catalog.defaultLocale;
    if (!languages.source.enabled.includes(locale)) fail('not_found');
    const session: DeliverySession = {
      runtime,
      tx,
      locale,
      enabledLocales: languages.source.enabled,
      options,
    };
    await writer.send({
      type: 'start',
      contractVersion: publicContentContract,
      kind: input.kind,
      locale,
      id: randomUUID(),
    });
    execution.started = true;
    const digest = createHash('sha256');
    let count = 0;
    for await (const item of allItems(session, input)) {
      signal.throwIfAborted();
      if (
        input.bucket !== undefined &&
        'canonicalPath' in item &&
        sitemapBucket(item.canonicalPath) !== input.bucket
      )
        continue;
      if (
        count >= options.policy.exportMaxItems ||
        (input.kind === 'sitemap' && input.bucket !== undefined && count >= 50000)
      )
        fail('capacity_exceeded');
      digest.update(await writer.send({ type: 'item', sequence: count, data: item }));
      count += 1;
    }
    await writer.send({ type: 'end', count, digest: digest.digest('hex') });
  }, signal);
}
async function exportContent(
  deps: Dependencies,
  raw: unknown,
  input: { write: (frame: Uint8Array) => Promise<void>; signal?: AbortSignal | undefined },
): Promise<void> {
  const parsed = exportInput.safeParse(raw);
  if (
    !parsed.success ||
    (parsed.data.kind !== 'sitemap' && parsed.data.bucket !== undefined) ||
    (parsed.data.kind === 'sitemap' && parsed.data.locale !== undefined)
  )
    fail('invalid_input');
  if (deps.active) fail('capacity_exceeded');
  deps.active = true;
  const signal = AbortSignal.any([
    AbortSignal.timeout(deps.options.policy.exportTimeoutMs),
    ...(input.signal ? [input.signal] : []),
  ]);
  const writer = createFrameWriter(deps.options, { write: input.write, signal });
  const execution: Execution = { input: parsed.data, writer, signal, started: false };
  try {
    await runExport(deps, execution);
  } catch (error) {
    if (execution.started && writer.canWrite())
      await writer
        .send({ type: 'error', code: error instanceof CmsError ? error.code : 'internal_error' })
        .catch(() => {});
    throw error;
  } finally {
    deps.active = false;
  }
}
export function createExporter(runtime: ContentRuntime, options: ContentDeliveryOptions) {
  const deps: Dependencies = { runtime, options, active: false };
  return (raw: unknown, write: (frame: Uint8Array) => Promise<void>, signal?: AbortSignal) =>
    exportContent(deps, raw, { write, signal });
}
