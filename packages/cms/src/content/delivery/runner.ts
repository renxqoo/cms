import { fail } from '@new-cms/cms/platform/contracts';
import { budgetedExecutor } from '../runtime.ts';
import type { ContentRuntime } from '../types.ts';
import type { ContentDeliveryOptions, DeliverySession } from './types.ts';
import type { PublicLanguages } from './contracts.ts';
import { readLanguages } from './source.ts';
import { envelope } from './integrity.ts';
export function createPublicRunner(runtime: ContentRuntime, options: ContentDeliveryOptions) {
  return async function run<T>(
    locale: string | undefined,
    signal: AbortSignal | undefined,
    work: (
      session: DeliverySession,
      languages: PublicLanguages,
      initialized: boolean,
    ) => Promise<T>,
  ) {
    const deadline = AbortSignal.any([
      AbortSignal.timeout(options.policy.readTimeoutMs),
      ...(signal ? [signal] : []),
    ]);
    return runtime.database.readOnlyTransaction(async (executor) => {
      const tx = budgetedExecutor(executor, options.policy.maxSqlQueries);
      const languages = await readLanguages(runtime, tx);
      const resolved = locale ?? languages.catalog.defaultLocale;
      const { enabled } = languages.source;
      if (!enabled.includes(resolved)) fail('not_found');
      const session: DeliverySession = {
        runtime,
        tx,
        locale: resolved,
        enabledLocales: enabled,
        options,
      };
      const data = await work(session, languages.catalog, languages.initialized);
      const result = envelope(resolved, data);
      if (Buffer.byteLength(JSON.stringify(result)) > options.policy.maxResponseBytes)
        fail('payload_too_large');
      return result;
    }, deadline);
  };
}
