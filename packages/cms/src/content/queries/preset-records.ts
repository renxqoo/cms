import { fail } from '@new-cms/cms/platform/contracts';
import { policyScope } from '../hooks/invoke.ts';
import { policyContext } from '../runtime.ts';
import { projectData } from '../fields/policy-read.ts';
import { presetAllowed, sharedPresetAccess } from './preset-access.ts';
import { presetActions } from './preset-access-contracts.ts';
import type { PresetAccess, PresetAction, PresetSnapshot } from './preset-access-contracts.ts';
import type { QueryPresetQuery } from './preset-contracts.ts';
import type { ContentRuntime, ContentState } from '../types.ts';

export interface PresetRow {
  id: string;
  owner_id: string;
  name: string;
  access: PresetAccess;
  query: QueryPresetQuery;
  version: number;
  created_at: Date;
  updated_at: Date;
}
export function presetSnapshot(row: PresetRow): PresetSnapshot {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    query: row.query,
    access: row.access,
  };
}

export async function presetView(state: ContentState, runtime: ContentRuntime, row: PresetRow) {
  const snapshot = presetSnapshot(row);
  const access = { ...row.access };
  const permissions = { read: false, update: false, delete: false };
  for (const action of presetActions) {
    permissions[action] = await presetAllowed(state, runtime, { preset: snapshot, action });
    const rule = row.access[action];
    const registered = state.collection.queryPresetConstraints?.[action]?.find(
      (option) => option.value === rule.constraint,
    );
    if (registered)
      access[action] = {
        constraint: rule.constraint,
        data: await projectData({
          ...policyScope(state),
          collection: { ...state.collection, fields: registered.fields ?? [] },
          data: rule.data ?? {},
          context: policyContext(state, rule.data ?? {}),
        }),
      };
  }
  return {
    id: row.id,
    collection: state.collection.key,
    ownerId: row.owner_id,
    name: row.name,
    shared: sharedPresetAccess(row.access, row.owner_id),
    access,
    permissions,
    query: row.query,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function lockedPreset(
  state: ContentState,
  runtime: ContentRuntime,
  input: { id: string; action: PresetAction },
): Promise<PresetRow> {
  const result = await state.tx.query<PresetRow>(
    'SELECT * FROM content_query_presets WHERE id=$1 AND collection_id=$2 FOR UPDATE',
    [input.id, state.collection.id],
  );
  const [row] = result.rows;
  if (
    !row ||
    !(await presetAllowed(state, runtime, { preset: presetSnapshot(row), action: input.action }))
  )
    fail('not_found');
  return row;
}

export function assertPresetOperation(state: ContentState): void {
  if (state.collection.enableQueryPresets === false) fail('forbidden');
  if (state.predicate) fail('invalid_input');
}

export function requirePresetVersion(row: PresetRow, version: number): void {
  if (row.version !== version) fail('version_conflict');
}
