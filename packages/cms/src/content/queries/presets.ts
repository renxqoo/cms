import { randomUUID } from 'node:crypto';
import { CmsError, fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import {
  auditContent,
  authorizeStateOperation,
  collectionPredicate,
  createRunner,
  idempotentReference,
} from '../runtime.ts';
import { relationScopes } from '../documents/relation-scopes.ts';
import { parsePresetInput } from './preset-parse.ts';
import { validatePresetQuery } from './preset-query.ts';
import { syncPresetReferences } from './preset-references.ts';
import {
  normalizePresetAccess,
  preventPresetLockout,
  presetAllowed,
  privatePresetAccess,
  sharedPresetAccess,
} from './preset-access.ts';
import {
  assertPresetOperation,
  lockedPreset,
  presetSnapshot,
  presetView,
  requirePresetVersion,
} from './preset-records.ts';
import type { PresetSnapshot } from './preset-access-contracts.ts';
import type { PresetRow } from './preset-records.ts';
import type { ContentRuntime, ContentState } from '../types.ts';

async function listState(state: ContentState, runtime: ContentRuntime): Promise<ContentState> {
  const actor = await authorizeStateOperation(state, {
    runtime,
    operationId: 'documents.list',
    collection: state.collection.key,
  });
  if (!actor) fail('unauthenticated');
  const { predicate: _predicate, ...base } = state;
  const reader = { ...base, actor, operationId: 'documents.list' };
  const predicate = await collectionPredicate(reader);
  return { ...reader, ...(predicate ? { predicate } : {}) };
}

async function sharePermission(state: ContentState, runtime: ContentRuntime): Promise<void> {
  const actor = await authorizeStateOperation(state, {
    runtime,
    operationId: 'queryPresets.share',
    collection: state.collection.key,
  });
  if (!actor) fail('unauthenticated');
  if (await collectionPredicate({ ...state, actor, operationId: 'queryPresets.share' }))
    fail('invalid_input');
}

async function qualifiedRows(state: ContentState, runtime: ContentRuntime) {
  const reader = await listState(state, runtime);
  const relations = await relationScopes(reader, runtime, { linkedVirtual: true });
  const result = await state.tx.query<PresetRow>(
    'SELECT * FROM content_query_presets WHERE collection_id=$1 ORDER BY created_at,id LIMIT $2',
    [state.collection.id, runtime.workPolicy.maxQueryPresets + 1],
  );
  if (result.rows.length > runtime.workPolicy.maxQueryPresets) fail('capacity_exceeded');
  const allowed: PresetRow[] = [];
  for (const row of result.rows) {
    if (!(await presetAllowed(state, runtime, { preset: presetSnapshot(row), action: 'read' })))
      continue;
    try {
      await validatePresetQuery(reader, runtime, { raw: row.query, relations });
      allowed.push(row);
    } catch (error) {
      if (!(error instanceof CmsError && ['invalid_input', 'forbidden'].includes(error.code)))
        throw error;
    }
  }
  return allowed;
}

function listQueryPresets(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parsePresetInput(runtime, runtime.schemas['queryPresets.list'], raw);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'queryPresets.list',
      collection: input.collection,
      ...(input.locale ? { locale: input.locale } : {}),
    },
    async (state) => {
      assertPresetOperation(state);
      const allowed = await qualifiedRows(state, runtime);
      const start = (input.page - 1) * input.pageSize;
      if (!Number.isSafeInteger(start)) fail('invalid_input');
      const rows = [];
      for (const row of allowed.slice(start, start + input.pageSize))
        rows.push(await presetView(state, runtime, row));
      return { rows, total: allowed.length, page: input.page, pageSize: input.pageSize };
    },
  );
}

function createQueryPreset(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parsePresetInput(runtime, runtime.schemas['queryPresets.create'], raw);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'queryPresets.create',
      collection: input.collection,
      ...(input.locale ? { locale: input.locale } : {}),
    },
    async (state) => {
      assertPresetOperation(state);
      const reader = await listState(state, runtime);
      const query = await validatePresetQuery(reader, runtime, {
        raw: input.query,
        relations: await relationScopes(reader, runtime, { linkedVirtual: true }),
      });
      const id = randomUUID();
      const access = await normalizePresetAccess(state, runtime, {
        preset: {
          id,
          ownerId: state.actor.id,
          name: input.name,
          query,
          access: input.access ?? privatePresetAccess(state.actor.id),
        },
      });
      if (sharedPresetAccess(access, state.actor.id)) await sharePermission(state, runtime);
      const result = await idempotentReference(state, { runtime, input }, () =>
        insertPreset(state, runtime, { id, name: input.name, access, query }),
      );
      return presetView(
        state,
        runtime,
        await lockedPreset(state, runtime, { id: result.id, action: 'read' }),
      );
    },
  );
}

async function insertPreset(
  state: ContentState,
  runtime: ContentRuntime,
  input: Omit<PresetSnapshot, 'ownerId'> & { id: string },
) {
  const { id, access, query } = input;
  const count = await state.tx.query<{ count: string }>(
    'SELECT count(*) FROM content_query_presets WHERE collection_id=$1',
    [state.collection.id],
  );
  if (Number(count.rows[0]?.count) >= runtime.workPolicy.maxQueryPresets) fail('capacity_exceeded');
  await state.tx.query(
    'INSERT INTO content_query_presets(id,collection_id,owner_id,name,access,query) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)',
    [
      id,
      state.collection.id,
      state.actor.id,
      input.name,
      JSON.stringify(access),
      JSON.stringify(query),
    ],
  );
  await syncPresetReferences(state, runtime, { id, access });
  await auditContent(state, {
    runtime,
    id,
    detail: {
      kind: 'queryPresetCreated',
      shared: sharedPresetAccess(access, state.actor.id),
    },
  });
  return { id };
}

function updateQueryPreset(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parsePresetInput(runtime, runtime.schemas['queryPresets.update'], raw);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'queryPresets.update',
      collection: input.collection,
      ...(input.locale ? { locale: input.locale } : {}),
    },
    async (state) => {
      assertPresetOperation(state);
      const current = await lockedPreset(state, runtime, { id: input.id, action: 'update' });
      requirePresetVersion(current, input.version);
      const reader = await listState(state, runtime);
      const query = await validatePresetQuery(reader, runtime, {
        raw: input.query,
        relations: await relationScopes(reader, runtime, { linkedVirtual: true }),
      });
      await preventPresetLockout(state, runtime, {
        ...presetSnapshot(current),
        name: input.name,
        query,
      });
      await state.tx.query(
        'UPDATE content_query_presets SET name=$2,query=$3::jsonb,version=version+1,updated_at=clock_timestamp() WHERE id=$1',
        [input.id, input.name, JSON.stringify(query)],
      );
      await auditContent(state, { runtime, id: input.id, detail: { kind: 'queryPresetUpdated' } });
      return presetView(
        state,
        runtime,
        await lockedPreset(state, runtime, { id: input.id, action: 'read' }),
      );
    },
  );
}

function shareQueryPreset(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parsePresetInput(runtime, runtime.schemas['queryPresets.share'], raw);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'queryPresets.share',
      collection: input.collection,
      ...(input.locale ? { locale: input.locale } : {}),
    },
    async (state) => {
      assertPresetOperation(state);
      const row = await lockedPreset(state, runtime, { id: input.id, action: 'update' });
      requirePresetVersion(row, input.version);
      const reader = await listState(state, runtime);
      await validatePresetQuery(reader, runtime, {
        raw: row.query,
        relations: await relationScopes(reader, runtime, { linkedVirtual: true }),
      });
      const access = await normalizePresetAccess(state, runtime, {
        preset: { ...presetSnapshot(row), access: input.access },
        previous: row.access,
      });
      await state.tx.query(
        'UPDATE content_query_presets SET access=$2::jsonb,version=version+1,updated_at=clock_timestamp() WHERE id=$1',
        [input.id, JSON.stringify(access)],
      );
      await syncPresetReferences(state, runtime, { id: input.id, access });
      await auditContent(state, {
        runtime,
        id: input.id,
        detail: { kind: 'queryPresetShared', shared: sharedPresetAccess(access, row.owner_id) },
      });
      return presetView(
        state,
        runtime,
        await lockedPreset(state, runtime, { id: input.id, action: 'read' }),
      );
    },
  );
}

function deleteQueryPreset(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parsePresetInput(runtime, runtime.schemas['queryPresets.delete'], raw);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'queryPresets.delete',
      collection: input.collection,
      ...(input.locale ? { locale: input.locale } : {}),
    },
    async (state) => {
      assertPresetOperation(state);
      const row = await lockedPreset(state, runtime, { id: input.id, action: 'delete' });
      requirePresetVersion(row, input.version);
      await state.tx.query('DELETE FROM content_query_presets WHERE id=$1', [input.id]);
      await auditContent(state, { runtime, id: input.id, detail: { kind: 'queryPresetDeleted' } });
    },
  );
}

export function createQueryPresetApi(runtime: ContentRuntime) {
  return {
    listQueryPresets: (ctx: RequestContext, raw: unknown) => listQueryPresets(runtime, ctx, raw),
    createQueryPreset: (ctx: RequestContext, raw: unknown) => createQueryPreset(runtime, ctx, raw),
    updateQueryPreset: (ctx: RequestContext, raw: unknown) => updateQueryPreset(runtime, ctx, raw),
    shareQueryPreset: (ctx: RequestContext, raw: unknown) => shareQueryPreset(runtime, ctx, raw),
    deleteQueryPreset: (ctx: RequestContext, raw: unknown) => deleteQueryPreset(runtime, ctx, raw),
  };
}
