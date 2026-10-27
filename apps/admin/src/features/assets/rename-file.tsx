'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Field, Input } from '@new-cms/ui/forms';
import { useShell } from '../../components/shell/shell-provider';
import { failure } from '../../api/result';
import { documentSchema } from '../../contracts/documents';
import { useAccessControl } from '../access-control/provider';
import { ManagementDialog } from '../management-shared/management-dialog';
import { RenameFeedback, RenameRecovery } from './rename-feedback';
import { useContentMutation } from '../collections/use-content-mutation';
import type { DocumentMediaProps } from './document-media';

const labels = {
  en: {
    title: 'Rename file',
    filename: 'Filename',
    description: 'Keep the original extension. Historical versions retain their filenames.',
    retry: 'Verify the same rename request',
    refresh: 'Refresh current document',
  },
  zh: {
    title: '重命名文件',
    filename: '文件名',
    description: '保留原扩展名，历史版本继续使用原文件名。',
    retry: '核实同一次重命名请求',
    refresh: '刷新当前文档',
  },
};
export function RenameFile(props: DocumentMediaProps) {
  const locale = useShell((state) => state.locale);
  const access = useAccessControl();
  const [open, setOpen] = useState(false);
  const { document } = props;
  const eligible =
    document?.file &&
    props.editor.mode === 'editing' &&
    document.trashedAt === null &&
    props.editor.actions.some(
      (action) => action.operationId === 'documents.renameFile' && action.state !== 'denied',
    ) &&
    access.can('documents.renameFile', {
      scopeKind: 'collection',
      collectionKey: props.collection.key,
    });
  if (!eligible) return null;
  return (
    <>
      <Button variant="outline" disabled={props.busy} onClick={() => setOpen(true)}>
        {labels[locale].title}
      </Button>
      {open ? <RenameDialog {...props} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
function RenameDialog(props: DocumentMediaProps & { onClose: () => void }) {
  const locale = useShell((state) => state.locale);
  const t = labels[locale];
  const [source] = useState(props.document);
  const [filename, setFilename] = useState(source?.file?.filename ?? '');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<ReturnType<typeof failure> | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [key] = useState(() => crypto.randomUUID());
  const mutation = useContentMutation();
  const busy = mutation.pending || mutation.locked || refreshing;
  const { onBusyChange } = props;
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  const valid = validFilename(source, props.document, filename);
  async function refresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await props.onDocumentChanged();
      if (alive.current) props.onClose();
    } catch {
      if (alive.current) setRefreshError(failure('request_failed', 0));
    } finally {
      if (alive.current) setRefreshing(false);
    }
  }
  function submit() {
    if (mutation.replayable) {
      mutation.retry();
      return;
    }
    if (!valid || !source || mutation.locked || refreshError) return;
    void mutation.run(
      {
        operation: 'documents.renameFile',
        params: { collection: props.collection.key, id: source.id },
        body: { revision: source.revision, locale: props.editor.locale, filename },
        ...(props.editorSessionId ? { editorSessionId: props.editorSessionId } : {}),
        idempotencyKey: key,
        response: documentSchema,
      },
      () => {
        void refresh();
      },
    );
  }
  return (
    <ManagementDialog
      open
      title={t.title}
      description={t.description}
      onClose={props.onClose}
      onSubmit={submit}
      submitLabel={mutation.replayable ? t.retry : t.title}
      pending={mutation.pending || refreshing}
      locked={mutation.locked}
      disabled={!valid || Boolean(refreshError) || (mutation.locked && !mutation.replayable)}
      actions={
        <RenameRecovery
          mutation={mutation}
          refreshError={refreshError}
          refresh={refresh}
          label={t.refresh}
        />
      }
      feedback={<RenameFeedback mutation={mutation} refreshError={refreshError} />}
    >
      <Field id="rename-file-name" label={t.filename}>
        <Input
          value={filename}
          maxLength={255}
          disabled={busy}
          onChange={(event) => setFilename(event.currentTarget.value)}
        />
      </Field>
    </ManagementDialog>
  );
}

function validFilename(
  source: DocumentMediaProps['document'],
  current: DocumentMediaProps['document'],
  filename: string,
): boolean {
  return Boolean(
    source?.file &&
    source.versionId === current?.versionId &&
    filename.trim() &&
    filename !== source.file.filename,
  );
}
