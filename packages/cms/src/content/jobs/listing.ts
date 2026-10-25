import type { RequestContext } from '@new-cms/cms/platform/contracts';
import type { ContentRuntime } from '../types.ts';
import { createRunner, parse } from '../runtime.ts';
import { queryJobs } from '../adapters/postgres/job-discovery.ts';
import { listUploads } from './uploads-listing.ts';

async function listJobs(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['content.listJobs'], raw);
  return createRunner(runtime)(
    { ctx, operationId: 'content.listJobs', collection: input.collection },
    (state) =>
      queryJobs(state.tx, {
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

export function createDiscoveryApi(runtime: ContentRuntime) {
  return {
    listJobs: (ctx: RequestContext, raw: unknown) => listJobs(runtime, ctx, raw),
    listUploads: (ctx: RequestContext, raw: unknown) => listUploads(runtime, ctx, raw),
  };
}
