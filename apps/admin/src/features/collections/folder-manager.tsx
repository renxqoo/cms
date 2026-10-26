'use client';
import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { Field, Input, NativeSelect } from '@new-cms/ui/forms';
import { folderListSchema } from '../../contracts/content';
import type { FolderTree } from '../../contracts/content';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { ManagementDialog } from '../management-shared/management-dialog';
import { collectionScope } from './content-policy';
import { useFolderRecovery } from './use-folder-recovery';
import { folderOperation, folderWrite } from './folder-intent';
import { FolderRecoveryFeedback } from './folder-recovery-feedback';
import { flattenFolders, folderParentOptions } from './folder-directory';
import type { FolderOption } from './folder-directory';
import type { ContentMessages } from './content-messages';
import type { DocumentChannel, DocumentChannelState } from './channel-types';
export function FolderManager({
  collection,
  channel,
  state,
  messages: t,
}: {
  collection: string;
  channel?: DocumentChannel;
  state?: DocumentChannelState;
  messages: ContentMessages;
}) {
  const access = useAccessControl();
  const can = (operation: string) => access.can(operation, collectionScope(collection));
  const result = useApiQuery({
    operation: 'folders.list',
    query: { collection },
    response: folderListSchema,
    enabled: can('folders.list'),
  });
  const [target, setTarget] = useState<FolderOption | 'create' | null>(null);
  const rows = result.data?.rows ?? [];
  const ready = result.phase === 'ready' && can('folders.list');
  return (
    <div className="space-y-3">
      <ManagementFeedback error={result.error} onRetry={result.reload} />
      {!ready ? <p className="text-xs text-muted-foreground">{t.failedDependency}</p> : null}
      <div className="flex flex-wrap items-end gap-2">
        {channel && state?.snapshot.document ? (
          <FolderMove
            channel={channel}
            state={state}
            rows={rows}
            ready={ready}
            allowed={can('documents.update')}
            messages={t}
          />
        ) : null}
        {can('folders.create') ? (
          <Button variant="outline" disabled={!ready} onClick={() => setTarget('create')}>
            {t.createFolder}
          </Button>
        ) : null}
      </div>
      <FolderDirectory
        rows={rows}
        ready={ready}
        editable={can('folders.update') || can('folders.delete')}
        onEdit={setTarget}
        messages={t}
      />
      {target ? (
        <FolderEdit
          key={target === 'create' ? 'create' : target.id}
          collection={collection}
          target={target}
          rows={rows}
          ready={ready}
          onClose={() => setTarget(null)}
          onChanged={result.reload}
          messages={t}
        />
      ) : null}
    </div>
  );
}
function FolderDirectory({
  rows,
  ready,
  editable,
  onEdit,
  messages: t,
}: {
  rows: readonly FolderTree[];
  ready: boolean;
  editable: boolean;
  onEdit: (row: FolderOption) => void;
  messages: ContentMessages;
}) {
  return (
    <div className="max-h-52 space-y-1 overflow-auto">
      {flattenFolders(rows).map((row) => (
        <div key={row.id} className="flex items-center justify-between gap-3 text-sm">
          <span>
            {'—'.repeat(row.depth)} {row.name}
          </span>
          {editable ? (
            <Button size="xs" variant="ghost" disabled={!ready} onClick={() => onEdit(row)}>
              {t.editFolder}
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
function FolderMove({
  channel,
  state,
  rows,
  ready,
  allowed,
  messages: t,
}: {
  channel: DocumentChannel;
  state: DocumentChannelState;
  rows: readonly FolderTree[];
  ready: boolean;
  allowed: boolean;
  messages: ContentMessages;
}) {
  const [value, setValue] = useState(state.snapshot.document?.folderId ?? '');
  return (
    <>
      <Field id="document-folder" label={t.folder}>
        <NativeSelect
          value={value}
          disabled={!ready || state.phase !== 'idle'}
          onChange={(event) => setValue(event.target.value)}
        >
          <option value="">{t.rootFolder}</option>
          {flattenFolders(rows).map((row) => (
            <option key={row.id} value={row.id}>
              {'—'.repeat(row.depth)} {row.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Button
        variant="outline"
        disabled={!ready || state.phase !== 'idle' || !allowed}
        onClick={() => void channel.execute({ kind: 'move', folderId: value || null })}
      >
        {t.move}
      </Button>
    </>
  );
}
interface FolderEditProps {
  collection: string;
  target: FolderOption | 'create';
  rows: readonly FolderTree[];
  ready: boolean;
  onClose: () => void;
  onChanged: () => void;
  messages: ContentMessages;
}
function FolderEdit({
  collection,
  target,
  rows,
  ready,
  onClose,
  onChanged,
  messages: t,
}: FolderEditProps) {
  const access = useAccessControl();
  const can = (operation: string) => access.can(operation, collectionScope(collection));
  const flow = useFolderRecovery({
    collection,
    canRead: ready && can('folders.list'),
    report: access.reportResult,
  });
  const { mutation, recovery } = flow;
  const [version, setVersion] = useState(target === 'create' ? null : target.version);
  const [deleting, setDeleting] = useState(false);
  const operation = folderOperation(target, deleting);
  const allowed = ready && can('folders.list') && can(operation);
  function completed() {
    onChanged();
    onClose();
  }
  async function submit(data: FormData) {
    if (!allowed) return;
    const write = folderWrite({ target, collection, version, deleting, data });
    if (!write) return;
    const result = await flow.run(write);
    if (result?.ok) completed();
  }
  return (
    <ManagementDialog
      open
      onClose={onClose}
      title={target === 'create' ? t.createFolder : t.editFolder}
      description={deleting ? t.purgeHint : t.conditional}
      onSubmit={(data) => void submit(data)}
      submitLabel={deleting ? t.deleteFolder : t.save}
      pending={mutation.phase === 'writing' || recovery.phase === 'reading'}
      locked={mutation.phase === 'blocked'}
      disabled={!allowed}
      destructive={deleting}
      feedback={
        <FolderRecoveryFeedback
          flow={flow}
          allowed={allowed}
          readAllowed={ready && can('folders.list')}
          create={target === 'create'}
          version={version}
          onAdopt={(value) => {
            if (flow.adopt(value, allowed)) setVersion(value);
          }}
          onCompleted={completed}
          onLeave={() => {
            onChanged();
            onClose();
          }}
          messages={t}
        />
      }
      actions={
        target !== 'create' && can('folders.delete') ? (
          <Button
            variant="destructive"
            disabled={!ready || mutation.phase !== 'idle'}
            onClick={() => setDeleting(!deleting)}
          >
            {t.deleteFolder}
          </Button>
        ) : null
      }
    >
      <FolderFields target={target} rows={rows} deleting={deleting} messages={t} />
      {!ready ? <Banner>{t.failedDependency}</Banner> : null}
    </ManagementDialog>
  );
}

function FolderFields({
  target,
  rows,
  deleting,
  messages: t,
}: Pick<FolderEditProps, 'target' | 'rows' | 'messages'> & { deleting: boolean }) {
  return (
    <>
      {' '}
      <Field id="folder-name" name="name" label={t.name} required>
        <Input
          defaultValue={target === 'create' ? '' : target.name}
          maxLength={128}
          required
          disabled={deleting}
        />
      </Field>
      <Field id="folder-parent" name="parentId" label={t.parent}>
        <NativeSelect
          defaultValue={target === 'create' ? '' : (target.parentId ?? '')}
          disabled={deleting}
        >
          <option value="">{t.rootFolder}</option>
          {folderParentOptions(rows, target === 'create' ? undefined : target.id).map((row) => (
            <option key={row.id} value={row.id}>
              {'—'.repeat(row.depth)} {row.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
    </>
  );
}
