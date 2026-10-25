import { fail } from '@new-cms/cms/platform/contracts';
import type { ContentRuntime, ContentState } from '../../types.ts';
import { createDiscoveryPolicy } from '../../jobs/discovery-policy.ts';
import { assetJobEligibility } from '../../jobs/asset-discovery-policy.ts';
import { discoverySql } from './discovery-sql.ts';

export async function assertAssetJobVisible(
  state: ContentState,
  input: { runtime: ContentRuntime; id: string },
): Promise<void> {
  const sql = discoverySql();
  const policy = createDiscoveryPolicy(state, input.runtime);
  const condition = await assetJobEligibility({ state, runtime: input.runtime, policy, sql });
  const sources = input.runtime.assetDiscoverySources({
    actorId: state.actor.id,
    collectionKey: state.collection.key,
  });
  const files = sql.relation(sources.fileBindings);
  const jobs = sql.relation(sources.jobs);
  const id = sql.parameter(input.id);
  const ctes = [
    ...sql.ctes,
    `discovery_file_bindings AS NOT MATERIALIZED (${files})`,
    `discovery_assets AS NOT MATERIALIZED (${jobs})`,
  ];
  const result = await state.tx.query(
    `WITH ${ctes.join(',')} SELECT a.id FROM discovery_assets a WHERE a.id=${id} AND (${condition})`,
    sql.values,
  );
  if (result.rowCount !== 1) fail('not_found');
}
