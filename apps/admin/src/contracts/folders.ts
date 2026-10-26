import { z } from 'zod';

export const folderSchema = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  name: z.string(),
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const folderTreeSchema = folderSchema.extend({
  get children() {
    return z.array(folderTreeSchema);
  },
});
export const folderListSchema = z.object({ rows: z.array(folderTreeSchema) });
export type Folder = z.infer<typeof folderSchema>;
export type FolderTree = z.infer<typeof folderTreeSchema>;
