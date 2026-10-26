'use client';

import { useState } from 'react';
import { z } from 'zod';
import { Button } from '@new-cms/ui/actions';
import { Field, Input, NativeSelect } from '@new-cms/ui/forms';
import { folderListSchema, folderSchema } from '../../contracts/folders';
import type { Folder, FolderTree } from '../../contracts/folders';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementDialog } from '../management-shared/management-dialog';
import { ManagementFeedback } from '../management-shared/feedback';
import type { ContentMessages } from './messages';
import { useContentMutation } from './use-content-mutation';

export function flattenFolders(
  rows: readonly FolderTree[],
  depth = 0,
): (Folder & { depth: number })[] {
  return rows.flatMap((row) => [{ ...row, depth }, ...flattenFolders(row.children, depth + 1)]);
}

export function FolderSelect({
  collection,
  value,
  onChange,
  label,
  root,
  disabled = false,
}: {
  collection: string;
  value: string | null;
  onChange: (value: string | null) => void;
  label: string;
  root: string;
  disabled?: boolean;
}) {
  const access = useAccessControl();
  const canRead = access.can('folders.list', {
    scopeKind: 'collection',
    collectionKey: collection,
  });
  const folders = useApiQuery({
    operation: 'folders.list',
    query: { collection },
    response: folderListSchema,
    enabled: canRead,
  });
  return (
    <Field id="document-folder" label={label} className="min-w-0 max-w-full">
      <NativeSelect
        className="max-w-full"
        value={value ?? ''}
        disabled={disabled || !canRead || folders.phase !== 'ready'}
        onChange={(event) => onChange(event.currentTarget.value || null)}
      >
        <option value="">{root}</option>
        {value &&
        !flattenFolders(folders.data?.rows ?? []).some((folder) => folder.id === value) ? (
          <option value={value}>{value}</option>
        ) : null}
        {flattenFolders(folders.data?.rows ?? []).map((folder) => (
          <option key={folder.id} value={folder.id}>
            {'— '.repeat(folder.depth)}
            {folder.name}
          </option>
        ))}
      </NativeSelect>
      <ManagementFeedback error={folders.error} onRetry={folders.reload} />
    </Field>
  );
}

export function FolderEditor({
  collection,
  folder,
  folders,
  t,
  onClose,
  onSaved,
}: {
  collection: string;
  folder: Folder | null;
  folders: Folder[];
  t: ContentMessages;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(folder?.name ?? '');
  const [parentId, setParent] = useState(folder?.parentId ?? '');
  const [key] = useState(() => crypto.randomUUID());
  const [confirmed, setConfirmed] = useState(folder);
  const [verified, setVerified] = useState<{ current: Folder | null } | null>(null);
  const mutation = useContentMutation();
  const dirty = folderDirty(confirmed, name, parentId);
  function verify() {
    if (!confirmed) return;
    void mutation.verify(
      { operation: 'folders.list', query: { collection }, response: folderListSchema },
      (page) => {
        const current =
          flattenFolders(page.rows).find((candidate) => candidate.id === confirmed.id) ?? null;
        if (current?.name === name.trim() && current.parentId === (parentId || null)) {
          mutation.resolve();
          onSaved();
        } else setVerified({ current });
      },
    );
  }
  return (
    <ManagementDialog
      open
      onClose={onClose}
      title={folder ? t.rename : t.newFolder}
      dirty={dirty}
      pending={mutation.pending}
      locked={mutation.locked}
      disabled={!name.trim() || !dirty || mutation.locked}
      actions={
        verified ? (
          <Button
            variant="outline"
            onClick={() => {
              if (verified.current) {
                setConfirmed(verified.current);
                mutation.resolve();
                setVerified(null);
              } else {
                mutation.resolve();
                onClose();
              }
            }}
          >
            {verified.current ? t.rebase : t.close}
          </Button>
        ) : null
      }
      feedback={<FolderMutationFeedback mutation={mutation} verify={verify} />}
      onSubmit={() => {
        void mutation.run(
          {
            operation: folder ? 'folders.update' : 'folders.create',
            ...(confirmed ? { params: { id: confirmed.id } } : {}),
            body: {
              collection,
              name: name.trim(),
              parentId: parentId || null,
              ...(confirmed ? { version: confirmed.version } : {}),
            },
            response: folderSchema,
            ...(!folder ? { idempotencyKey: key } : {}),
          },
          onSaved,
        );
      }}
    >
      <Field id="folder-name" label={t.name}>
        <Input
          value={name}
          maxLength={128}
          onChange={(event) => setName(event.currentTarget.value)}
        />
      </Field>
      {verified ? (
        <div className="space-y-3">
          <p>{t.conflict}</p>
          <p>{verified.current?.name ?? t.removeFolder}</p>
        </div>
      ) : null}
      <Field id="folder-parent" label={t.parentFolder}>
        <NativeSelect value={parentId} onChange={(event) => setParent(event.currentTarget.value)}>
          <option value="">{t.rootFolder}</option>
          {folders
            .filter((candidate) => candidate.id !== folder?.id)
            .map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
        </NativeSelect>
      </Field>
    </ManagementDialog>
  );
}

export function FolderDelete({
  collection,
  folder,
  t,
  onClose,
  onDeleted,
}: {
  collection: string;
  folder: Folder;
  t: ContentMessages;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const mutation = useContentMutation();
  const [confirmed, setConfirmed] = useState(folder);
  const [latest, setLatest] = useState<Folder | null>(null);
  function verify() {
    void mutation.verify(
      { operation: 'folders.list', query: { collection }, response: folderListSchema },
      (page) => {
        const current = flattenFolders(page.rows).find(
          (candidate) => candidate.id === confirmed.id,
        );
        if (current) setLatest(current);
        else {
          mutation.resolve();
          onDeleted();
        }
      },
    );
  }
  return (
    <ManagementDialog
      open
      onClose={onClose}
      title={t.removeFolder}
      description={t.removeFolderWarning}
      destructive
      pending={mutation.pending}
      locked={mutation.locked}
      disabled={mutation.locked}
      actions={
        latest ? (
          <Button
            variant="outline"
            onClick={() => {
              setConfirmed(latest);
              setLatest(null);
              mutation.resolve();
            }}
          >
            {t.rebase}
          </Button>
        ) : null
      }
      feedback={
        <ManagementFeedback
          error={mutation.error}
          {...(mutation.locked ? { onRetry: verify } : {})}
        />
      }
      onSubmit={() => {
        void mutation.run(
          {
            operation: 'folders.delete',
            params: { id: confirmed.id },
            query: { collection, version: confirmed.version },
            response: z.undefined(),
          },
          onDeleted,
        );
      }}
    >
      <p className="break-words">{folder.name}</p>
      {latest ? (
        <div className="space-y-3">
          <p>
            {t.conflict} · {latest.name} · {latest.version}
          </p>
        </div>
      ) : null}
    </ManagementDialog>
  );
}

function folderDirty(confirmed: Folder | null, name: string, parentId: string) {
  return name !== (confirmed?.name ?? '') || parentId !== (confirmed?.parentId ?? '');
}

function FolderMutationFeedback({
  mutation,
  verify,
}: {
  mutation: ReturnType<typeof useContentMutation>;
  verify: () => void;
}) {
  const onRetry = mutation.replayable ? mutation.retry : verify;
  return <ManagementFeedback error={mutation.error} {...(mutation.locked ? { onRetry } : {})} />;
}
