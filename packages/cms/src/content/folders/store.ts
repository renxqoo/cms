import { fail } from '@new-cms/cms/platform/contracts';
import type { ContentRuntime, ContentState } from '../types.ts';

export interface Folder {
  id: string;
  parentId: string | null;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface FolderRow extends Omit<Folder, 'createdAt' | 'updatedAt'> {
  createdAt: Date;
  updatedAt: Date;
}

export const folderColumns =
  'id,parent_id AS "parentId",name,version,created_at AS "createdAt",updated_at AS "updatedAt"';

export function folderView(row: FolderRow): Folder {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function lockFolderCollection(state: ContentState): Promise<void> {
  await state.tx.query("SELECT pg_advisory_xact_lock(hashtextextended('content-folders:'||$1,0))", [
    state.collection.id,
  ]);
}

export async function listFolders(state: ContentState, runtime: ContentRuntime): Promise<Folder[]> {
  const result = await state.tx.query<FolderRow>(
    `SELECT ${folderColumns} FROM content_folders WHERE collection_id=$1 ORDER BY lower(name),id LIMIT $2`,
    [state.collection.id, runtime.workPolicy.maxFolders + 1],
  );
  if (result.rows.length > runtime.workPolicy.maxFolders) fail('capacity_exceeded');
  return result.rows.map(folderView);
}

export async function assertFolder(
  state: ContentState,
  input: { runtime: ContentRuntime; folderId: string | null },
): Promise<void> {
  if (input.folderId === null) return;
  const result = await state.tx.query(
    'SELECT id FROM content_folders WHERE id=$1 AND collection_id=$2 FOR KEY SHARE',
    [input.folderId, state.collection.id],
  );
  if (result.rowCount !== 1) fail('not_found');
}

export function validateFolderMove(input: {
  id?: string;
  parentId: string | null;
  folders: readonly Folder[];
  maxDepth: number;
}): void {
  const byId = new Map(input.folders.map((folder) => [folder.id, folder]));
  let current = input.parentId;
  let depth = 1;
  while (current !== null) {
    if (current === input.id) fail('invalid_input');
    const folder = byId.get(current);
    if (!folder) fail('not_found');
    current = folder.parentId;
    depth += 1;
    if (depth > input.maxDepth) fail('capacity_exceeded');
  }
  if (input.id) validateDescendantDepth({ ...input, depth });
}

function validateDescendantDepth(input: {
  id?: string;
  parentId: string | null;
  folders: readonly Folder[];
  maxDepth: number;
  depth: number;
}): void {
  let frontier = [input.id];
  let { depth } = input;
  while (frontier.length > 0) {
    const next = input.folders
      .filter((folder) => frontier.includes(folder.parentId ?? undefined))
      .map((folder) => folder.id);
    if (next.length === 0) return;
    depth += 1;
    if (depth > input.maxDepth) fail('capacity_exceeded');
    frontier = next;
  }
}

export async function readFolder(state: ContentState, id: string): Promise<Folder> {
  const result = await state.tx.query<FolderRow>(
    `SELECT ${folderColumns} FROM content_folders WHERE id=$1 AND collection_id=$2 FOR UPDATE`,
    [id, state.collection.id],
  );
  const [row] = result.rows;
  if (!row) fail('not_found');
  return folderView(row);
}

export interface FolderTree extends Folder {
  children: FolderTree[];
}
export function folderTree(folders: readonly Folder[]): FolderTree[] {
  const nodes = new Map(
    folders.map((folder) => [folder.id, { ...folder, children: [] as FolderTree[] }]),
  );
  const roots: FolderTree[] = [];
  for (const node of nodes.values()) {
    if (node.parentId === null) roots.push(node);
    else {
      const parent = nodes.get(node.parentId);
      if (!parent) fail('temporarily_unavailable');
      parent.children.push(node);
    }
  }
  const seen = new Set<string>();
  const pending = [...roots];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) continue;
    if (seen.has(node.id)) fail('temporarily_unavailable');
    seen.add(node.id);
    pending.push(...node.children);
  }
  if (seen.size !== nodes.size) fail('temporarily_unavailable');
  return roots;
}
