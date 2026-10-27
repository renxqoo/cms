'use client';

import type { ReactNode } from 'react';

import { useState } from 'react';
import { FolderCog, FolderIcon, Plus } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Input } from '@new-cms/ui/forms';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@new-cms/ui/overlays';
import { folderListSchema } from '../../contracts/folders';
import type { Folder } from '../../contracts/folders';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { flattenFolders, FolderEditor, FolderDelete } from './folders';
import type { ContentMessages } from './messages';

export function FolderManager({
  collection,
  t,
  onChanged,
  icon,
}: {
  collection: string;
  t: ContentMessages;
  onChanged: () => void;
  icon?: ReactNode;
}) {
  const access = useAccessControl();
  const scope = { scopeKind: 'collection', collectionKey: collection } as const;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Folder | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Folder | null>(null);
  const result = useApiQuery({
    operation: 'folders.list',
    query: { collection },
    response: folderListSchema,
    enabled: open && access.can('folders.list', scope),
  });
  const folders = flattenFolders(result.data?.rows ?? []);
  const rows = folders.filter((folder) =>
    folder.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  function changed() {
    setEditing(null);
    setDeleting(null);
    result.reload();
    onChanged();
  }
  if (!access.can('folders.list', scope)) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <FolderCog aria-hidden="true" />
            {t.folders}
          </Button>
        }
      />
      <DialogContent closeLabel={t.close} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.folders}</DialogTitle>
          <DialogDescription>{t.foldersDescription}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label={t.searchFolders}
            placeholder={t.searchFolders}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            className="min-w-40 flex-1"
          />
          {access.can('folders.create', scope) ? (
            <Button onClick={() => setEditing('new')}>
              <Plus aria-hidden="true" />
              {t.newFolder}
            </Button>
          ) : null}
        </div>
        <ManagementFeedback error={result.error} onRetry={result.reload} />
        {result.phase === 'loading' ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t.loading}
          </p>
        ) : null}
        {result.phase === 'ready' && rows.length === 0 ? (
          <p
            role="status"
            className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"
          >
            {search.trim() ? t.noMatchingFolders : t.noFolders}
          </p>
        ) : null}
        <ul className="max-h-96 space-y-1 overflow-y-auto">
          {rows.map((folder) => (
            <li
              key={folder.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 px-3 py-2"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2 break-words">
                {icon ?? (
                  <FolderIcon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                )}
                <span>
                  {'— '.repeat(folder.depth)}
                  {folder.name}
                </span>
              </span>
              <div className="flex shrink-0 gap-1">
                {access.can('folders.update', scope) ? (
                  <Button variant="ghost" size="sm" onClick={() => setEditing(folder)}>
                    {t.rename}
                  </Button>
                ) : null}
                {access.can('folders.delete', scope) ? (
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(folder)}>
                    {t.removeFolder}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">{t.close}</Button>} />
        </DialogFooter>
        {editing ? (
          <FolderEditor
            key={editing === 'new' ? 'new' : editing.id}
            collection={collection}
            folder={editing === 'new' ? null : editing}
            folders={folders}
            t={t}
            onClose={() => setEditing(null)}
            onSaved={changed}
          />
        ) : null}
        {deleting ? (
          <FolderDelete
            collection={collection}
            folder={deleting}
            t={t}
            onClose={() => setDeleting(null)}
            onDeleted={changed}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
