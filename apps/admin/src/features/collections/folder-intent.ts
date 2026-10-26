import { emptyResponseSchema } from '../../contracts/auth';
import { folderSchema } from '../../contracts/content';
import type { ContentMutationIntent } from './use-content-mutation';
import type { FolderOption } from './folder-directory';
export type FolderExpectation =
  | { kind: 'create' }
  | { kind: 'update'; id: string; version: number; name: string; parentId: string | null }
  | { kind: 'delete'; id: string; version: number };
export interface FolderWrite {
  intent: ContentMutationIntent;
  expected: FolderExpectation;
}
export function folderOperation(target: FolderOption | 'create', deleting: boolean) {
  if (target === 'create') return 'folders.create';
  return deleting ? 'folders.delete' : 'folders.update';
}
export function folderWrite(input: {
  target: FolderOption | 'create';
  collection: string;
  version: number | null;
  deleting: boolean;
  data: FormData;
}): FolderWrite | null {
  const { target, collection, version, deleting, data } = input;
  const operation = folderOperation(target, deleting);
  if (deleting && target !== 'create' && version !== null)
    return {
      intent: {
        operation,
        params: { id: target.id },
        query: { collection, version },
        response: emptyResponseSchema,
      },
      expected: { kind: 'delete', id: target.id, version },
    };
  const name = data.get('name');
  const parent = data.get('parentId');
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 128) return null;
  const body = {
    collection,
    name: name.trim(),
    parentId: typeof parent === 'string' && parent ? parent : null,
  };
  if (target === 'create')
    return {
      intent: { operation, body, response: folderSchema, key: 'new' },
      expected: { kind: 'create' },
    };
  if (version === null) return null;
  return {
    intent: {
      operation,
      params: { id: target.id },
      body: { ...body, version },
      response: folderSchema,
    },
    expected: { kind: 'update', id: target.id, version, name: body.name, parentId: body.parentId },
  };
}
export function folderWriteConfirmed(expected: FolderExpectation, row: FolderOption | null) {
  if (expected.kind === 'create') return false;
  if (expected.kind === 'delete') return row === null;
  return (
    row?.id === expected.id &&
    row.version === expected.version + 1 &&
    row.name === expected.name &&
    row.parentId === expected.parentId
  );
}

export function canAdoptFolder(
  expected: FolderExpectation | undefined,
  row: FolderOption | null,
  version: number,
) {
  return (
    expected !== undefined &&
    expected.kind !== 'create' &&
    row?.version === version &&
    version > expected.version
  );
}
