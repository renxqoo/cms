import type { AllowedOperation } from '../../contracts/auth';
import type { Collection } from '../../contracts/content';

type CollectionChoice = Pick<Collection, 'key' | 'label'>;

export function grantKey(grant: AllowedOperation): string {
  return JSON.stringify([grant.operationId, grant.scopeKind, grant.collectionKey]);
}

export function selectableGrants(
  operations: readonly AllowedOperation[],
  available?: readonly AllowedOperation[],
): AllowedOperation[] {
  const limit = available && new Set(available.map(grantKey));
  const unique = new Map<string, AllowedOperation>();
  for (const grant of operations) {
    const key = grantKey(grant);
    const validScope =
      grant.scopeKind === 'global'
        ? grant.collectionKey === null
        : grant.collectionKey !== null && grant.collectionKey.length > 0;
    if (validScope && (!limit || limit.has(key))) unique.set(key, grant);
  }
  return [...unique.values()];
}

export function permissionGroups(
  grants: readonly AllowedOperation[],
  collections: readonly CollectionChoice[],
) {
  const labels = new Map(collections.map((collection) => [collection.key, collection.label]));
  const groups = new Map<
    string,
    { key: string; label: string; collection: boolean; grants: AllowedOperation[] }
  >();
  for (const grant of grants) {
    const collection = grant.scopeKind === 'collection';
    const resource = collection ? (grant.collectionKey ?? '') : grant.operationId.split('.')[0];
    const key = JSON.stringify([grant.scopeKind, resource]);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: collection
          ? (labels.get(resource ?? '') ?? resource ?? grant.operationId)
          : (resource ?? grant.operationId),
        collection,
        grants: [],
      };
      groups.set(key, group);
    }
    group.grants.push(grant);
  }
  return [...groups.values()];
}

export function toggleGrant(
  value: readonly AllowedOperation[],
  grant: AllowedOperation,
  checked: boolean,
): AllowedOperation[] {
  const retained = value.filter((item) => grantKey(item) !== grantKey(grant));
  return checked ? [...retained, grant] : retained;
}
