import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { recoveryResources } from '../adapters/postgres/recovery-store.ts';
import { createRunner } from '../runtime.ts';
import type { AccessRuntime } from '../types.ts';
import { recoveryPageSchema } from './contracts.ts';
import type { RecoveryPage } from './contracts.ts';
import { parseRecoveryInput } from './input.ts';
import { recoveryCatalog } from './catalog.ts';

export function createRecoveryApi(runtime: AccessRuntime) {
  if (
    !Number.isSafeInteger(runtime.recoveryMaxResponseBytes) ||
    runtime.recoveryMaxResponseBytes < 1
  ) {
    throw new Error('Invalid recovery response byte budget');
  }
  const run = createRunner(runtime);
  return {
    readRecovery: (ctx: RequestContext, input: unknown): Promise<RecoveryPage> =>
      run({ ctx, operationId: 'access.readRecovery', mode: 'shared' }, async ({ tx }) => {
        const query = parseRecoveryInput(runtime.schemas['access.readRecovery'], input);
        const raw =
          query.resource === 'endpoints'
            ? await recoveryCatalog(tx, runtime, query)
            : { resource: query.resource, ...(await recoveryResources(tx, query)) };
        const result = recoveryPageSchema.parse(raw);
        if (Buffer.byteLength(JSON.stringify(result)) > runtime.recoveryMaxResponseBytes)
          fail('capacity_exceeded');
        return result;
      }),
  };
}
