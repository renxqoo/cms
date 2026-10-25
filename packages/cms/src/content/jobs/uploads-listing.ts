import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { assetsInputSchemas } from '@new-cms/cms/assets';
import type { ContentRuntime } from '../types.ts';
import { createRunner, parse } from '../runtime.ts';
import { queryUploads } from '../adapters/postgres/upload-discovery.ts';

export async function listUploads(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(assetsInputSchemas(runtime.policy)['assets.listUploads'], raw);
  return createRunner(runtime)(
    { ctx, operationId: 'assets.listUploads', collection: input.collection },
    (state) =>
      queryUploads(state.tx, {
        state,
        runtime,
        query: input,
        sources: runtime.assetDiscoverySources({
          actorId: state.actor.id,
          collectionKey: state.collection.key,
        }),
      }),
  );
}
