'use client';

import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Field, NativeSelect, Switch } from '@new-cms/ui/forms';
import { ManagementDialog } from '../management-shared/management-dialog';
import { CopyDocumentDialog } from './copy-document-dialog';
type ConfirmedAction = 'publish' | 'unpublish' | 'archive';
import type { ContentEditorModel } from './use-content-editor';
import { collectionHref } from './query';
import { FolderSelect } from './folders';
import { PublicationSchedule } from './schedule';

function editorStatus(model: ContentEditorModel) {
  if (model.busy) return model.t.saving;
  if (model.dirty) return model.t.dirty;
  return model.state.saved ? model.t.saved : '';
}

export function EditorToolbar({ model }: { model: ContentEditorModel }) {
  const { state, props, controller, navigation, t, busy, allowed } = model;
  const { snapshot } = state;
  if (!snapshot) return null;
  return (
    <div className="flex flex-wrap items-end gap-4">
      <Field id="editor-locale" label={t.locale}>
        <NativeSelect
          value={snapshot.editor.locale}
          disabled={busy}
          onChange={(event) =>
            navigation.push(
              `${collectionHref(props.collectionKey, props.documentId ?? 'new')}?locale=${encodeURIComponent(event.currentTarget.value)}`,
            )
          }
        >
          {snapshot.editor.locales.supported.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <FolderSelect
        collection={props.collectionKey}
        value={state.folderId}
        onChange={controller.setFolder}
        label={t.folder}
        root={t.rootFolder}
        disabled={busy || props.intent === 'read'}
      />
      {snapshot.document &&
      snapshot.collection.capabilities.autosave &&
      allowed('documents.autosave') ? (
        <Switch label={t.autosave} checked={model.autosave} onCheckedChange={model.setAutosave} />
      ) : null}
      <p role="status" className="text-sm text-muted-foreground">
        {editorStatus(model)}
      </p>
    </div>
  );
}

export function EditorActions({ model }: { model: ContentEditorModel }) {
  const [confirm, setConfirm] = useState<ConfirmedAction | null>(null);
  const [schedule, setSchedule] = useState(false);
  const { state, t, controller, busy, dirty, invalid, allowed } = model;
  const { snapshot } = state;
  if (!snapshot) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {allowed(snapshot.document ? 'documents.update' : 'documents.create') ? (
          <Button
            disabled={saveBlocked(model)}
            onClick={() => {
              void controller.submit('save');
            }}
          >
            {t.save}
          </Button>
        ) : null}
        {snapshot.document ? (
          <DocumentActions
            model={model}
            confirm={setConfirm}
            schedule={() => setSchedule(true)}
            copy={() => model.setCopyOpen(true)}
          />
        ) : null}
      </div>
      {schedule && snapshot.document ? (
        <PublicationSchedule
          document={snapshot.document}
          t={t}
          onClose={() => setSchedule(false)}
          onBusyChange={controller.setExternalBusy}
        />
      ) : null}
      {model.copyOpen ? (
        <CopyDocumentDialog
          snapshot={snapshot}
          services={model.services}
          busy={state.busy || state.externalBusy}
          failure={state.failure}
          onClose={() => model.setCopyOpen(false)}
          onCopy={controller.copy}
        />
      ) : null}
      {confirm ? (
        <ManagementDialog
          open
          onClose={() => setConfirm(null)}
          title={t.confirm}
          description={confirm === 'archive' ? t.archiveWarning : undefined}
          submitLabel={t.confirm}
          destructive={confirm === 'archive'}
          disabled={busy || dirty || invalid}
          pending={state.busy}
          onSubmit={() => {
            void controller.submit(confirm);
            setConfirm(null);
          }}
        >
          <p>{actionLabel(confirm, t)}</p>
        </ManagementDialog>
      ) : null}
    </>
  );
}

function actionLabel(action: ConfirmedAction, t: ContentEditorModel['t']) {
  if (action === 'publish') return t.publish;
  if (action === 'unpublish') return t.unpublish;
  return t.archive;
}

function DocumentActions({
  model,
  confirm,
  schedule,
  copy,
}: {
  model: ContentEditorModel;
  confirm: (action: ConfirmedAction) => void;
  schedule: () => void;
  copy: () => void;
}) {
  const { t, state, busy, dirty, invalid, allowed } = model;
  const blocked = busy || dirty;
  return (
    <>
      {allowed('documents.publish') ? (
        <Button disabled={blocked || invalid} onClick={() => confirm('publish')}>
          {t.publish}
        </Button>
      ) : null}
      {state.snapshot?.document?.publishedVersionId && allowed('documents.unpublish') ? (
        <Button variant="outline" disabled={blocked} onClick={() => confirm('unpublish')}>
          {t.unpublish}
        </Button>
      ) : null}
      {allowed('documents.copy') ? (
        <Button variant="outline" disabled={blocked} onClick={copy}>
          {t.copy}
        </Button>
      ) : null}
      {allowed('documents.archive') && model.canReadList ? (
        <Button variant="destructive" disabled={blocked} onClick={() => confirm('archive')}>
          {t.archive}
        </Button>
      ) : null}
      {allowed('content.schedulePublication') && model.canReadJob ? (
        <Button variant="outline" disabled={blocked} onClick={schedule}>
          {t.schedule}
        </Button>
      ) : null}
    </>
  );
}

function saveBlocked(model: ContentEditorModel) {
  return (
    model.busy ||
    model.invalid ||
    (model.state.snapshot?.document !== null && !model.dirty) ||
    model.state.failure?.error.code === 'version_conflict'
  );
}
