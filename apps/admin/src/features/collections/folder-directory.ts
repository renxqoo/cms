import type { FolderTree } from '../../contracts/content';
export interface FolderOption {
  id: string;
  name: string;
  version: number;
  parentId: string | null;
  depth: number;
}
export function flattenFolders(rows: readonly FolderTree[], depth = 0): FolderOption[] {
  return rows.flatMap((row) => [
    { id: row.id, name: row.name, version: row.version, parentId: row.parentId, depth },
    ...flattenFolders(row.children, depth + 1),
  ]);
}
export function folderParentOptions(rows: readonly FolderTree[], id: string | undefined) {
  const flat = flattenFolders(rows);
  const excluded = new Set<string>();
  if (id) excluded.add(id);
  for (const row of flat) {
    if (row.parentId && excluded.has(row.parentId)) excluded.add(row.id);
  }
  return flat.filter((row) => !excluded.has(row.id));
}
