import { randomUUID } from 'node:crypto';
import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { auditContent, createRunner, idempotentReference, parse } from '../runtime.ts';
import {
  folderTree,
  folderColumns,
  folderView,
  listFolders,
  lockFolderCollection,
  readFolder,
  validateFolderMove,
} from './store.ts';
import type { ContentRuntime } from '../types.ts';

async function createFolder(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['folders.create'], raw);
  return createRunner(runtime)(
    { ctx, operationId: 'folders.create', collection: input.collection },
    async (state) => {
      const reference = await idempotentReference(state, { runtime, input }, async () => {
        await lockFolderCollection(state);
        const folders = await listFolders(state, runtime);
        if (folders.length >= runtime.workPolicy.maxFolders) fail('capacity_exceeded');
        validateFolderMove({
          parentId: input.parentId,
          folders,
          maxDepth: runtime.workPolicy.maxFolderDepth,
        });
        const id = randomUUID();
        await state.tx.query(
          'INSERT INTO content_folders(id,collection_id,parent_id,name) VALUES($1,$2,$3,$4)',
          [id, state.collection.id, input.parentId, input.name],
        );
        await auditContent(state, { runtime, id, detail: { kind: 'folderCreated' } });
        return { id };
      });
      return readFolder(state, reference.id);
    },
  );
}

async function updateFolder(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['folders.update'], raw);
  return createRunner(runtime)(
    { ctx, operationId: 'folders.update', collection: input.collection },
    async (state) => {
      await lockFolderCollection(state);
      const current = await readFolder(state, input.id);
      if (input.version !== current.version) fail('version_conflict');
      const parentId = input.parentId === undefined ? current.parentId : input.parentId;
      validateFolderMove({
        id: current.id,
        parentId,
        folders: await listFolders(state, runtime),
        maxDepth: runtime.workPolicy.maxFolderDepth,
      });
      const result = await state.tx.query<{
        id: string;
        parentId: string | null;
        name: string;
        version: number;
        createdAt: Date;
        updatedAt: Date;
      }>(
        `UPDATE content_folders SET parent_id=$3,name=$4,version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND collection_id=$2 RETURNING ${folderColumns}`,
        [input.id, state.collection.id, parentId, input.name ?? current.name],
      );
      const [updated] = result.rows;
      if (!updated) fail('not_found');
      await auditContent(state, {
        runtime,
        id: input.id,
        detail: { kind: 'folderUpdated', version: updated.version },
      });
      return folderView(updated);
    },
  );
}

async function deleteFolder(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['folders.delete'], raw);
  return createRunner(runtime)(
    { ctx, operationId: 'folders.delete', collection: input.collection },
    async (state) => {
      await lockFolderCollection(state);
      const current = await readFolder(state, input.id);
      if (input.version !== current.version) fail('version_conflict');
      const content = await state.tx.query(
        'SELECT 1 FROM content_documents WHERE folder_id=$1 LIMIT 1',
        [input.id],
      );
      const children = await state.tx.query(
        'SELECT 1 FROM content_folders WHERE parent_id=$1 LIMIT 1',
        [input.id],
      );
      if (content.rowCount !== 0 || children.rowCount !== 0) fail('resource_in_use');
      await state.tx.query('DELETE FROM content_folders WHERE id=$1 AND collection_id=$2', [
        input.id,
        state.collection.id,
      ]);
      await auditContent(state, { runtime, id: input.id, detail: { kind: 'folderDeleted' } });
    },
  );
}

export function createFolderApi(runtime: ContentRuntime) {
  return {
    listFolders: (ctx: RequestContext, raw: unknown) => {
      const input = parse(runtime.schemas['folders.list'], raw);
      return createRunner(runtime)(
        { ctx, operationId: 'folders.list', collection: input.collection },
        async (state) => ({ rows: folderTree(await listFolders(state, runtime)) }),
      );
    },
    createFolder: (ctx: RequestContext, raw: unknown) => createFolder(runtime, ctx, raw),
    updateFolder: (ctx: RequestContext, raw: unknown) => updateFolder(runtime, ctx, raw),
    deleteFolder: (ctx: RequestContext, raw: unknown) => deleteFolder(runtime, ctx, raw),
  };
}
