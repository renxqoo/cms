'use client';

import { useState } from 'react';
import {
  ArrowLeftIcon,
  CheckIcon,
  CircleDotIcon,
  CopyIcon,
  CalendarClockIcon,
  EllipsisIcon,
  SaveIcon,
  SendIcon,
  Trash2Icon,
  Undo2Icon,
} from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Field, NativeSelect, Switch } from '@new-cms/ui/forms';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@new-cms/ui/overlays';
import { ManagementDialog } from '../management-shared/management-dialog';
import { CopyDocumentDialog } from './copy-document-dialog';
type ConfirmedAction = 'publish' | 'unpublish' | 'archive';
import type { ContentEditorModel } from './use-content-editor';
import { collectionHref } from './query';
import { FolderSelect } from './folders';
import { PublicationSchedule } from './schedule';
import { DocumentHistory } from './history';

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
    <div className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-border/50 xl:flex-row xl:items-center xl:justify-between">
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(8rem,10rem)_minmax(10rem,18rem)] [&_select]:w-full">
        <Field id="editor-locale" label={t.locale} className="min-w-0">
          <NativeSelect
            className="w-full"
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
      </div>
      <div className="flex min-h-8 flex-wrap items-center gap-x-5 gap-y-3 border-t border-border/60 pt-4 xl:border-t-0 xl:border-l xl:pl-5 xl:pt-0">
        {snapshot.document &&
        snapshot.collection.capabilities.autosave &&
        allowed('documents.autosave') ? (
          <Switch label={t.autosave} checked={model.autosave} onCheckedChange={model.setAutosave} />
        ) : null}
        <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {editorStatus(model) ? (
            model.dirty || busy ? (
              <CircleDotIcon aria-hidden="true" className="size-3.5" />
            ) : (
              <CheckIcon aria-hidden="true" className="size-3.5" />
            )
          ) : null}
          {editorStatus(model)}
        </p>
      </div>
    </div>
  );
}

export function EditorActions({ model }: { model: ContentEditorModel }) {
  const [confirm, setConfirm] = useState<ConfirmedAction | null>(null);
  const [schedule, setSchedule] = useState(false);
  const { state, t, controller, busy, dirty, invalid } = model;
  const { snapshot } = state;
  return (
    <>
      <EditorActionButtons model={model} confirm={setConfirm} schedule={() => setSchedule(true)} />
      {schedule && snapshot?.document ? (
        <PublicationSchedule
          document={snapshot.document}
          t={t}
          onClose={() => setSchedule(false)}
          onBusyChange={controller.setExternalBusy}
        />
      ) : null}
      {model.copyOpen && snapshot ? (
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

function EditorActionButtons({
  model,
  confirm,
  schedule,
}: {
  model: ContentEditorModel;
  confirm: (action: ConfirmedAction) => void;
  schedule: () => void;
}) {
  const {
    state: { snapshot },
    t,
    controller,
    allowed,
  } = model;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="ghost"
        onClick={() => model.navigation.push(collectionHref(model.props.collectionKey))}
      >
        <ArrowLeftIcon aria-hidden="true" />
        {t.back}
      </Button>
      {snapshot && allowed(snapshot.document ? 'documents.update' : 'documents.create') ? (
        <Button
          disabled={saveBlocked(model)}
          onClick={() => {
            void controller.submit('save');
          }}
        >
          <SaveIcon aria-hidden="true" />
          {t.save}
        </Button>
      ) : null}
      {snapshot?.document ? (
        <DocumentActions
          model={model}
          confirm={confirm}
          schedule={schedule}
          copy={() => model.setCopyOpen(true)}
        />
      ) : null}
    </div>
  );
}

function actionLabel(action: ConfirmedAction, t: ContentEditorModel['t']) {
  if (action === 'publish') return t.publish;
  if (action === 'unpublish') return t.unpublish;
  return t.archive;
}

interface DocumentActionProps {
  model: ContentEditorModel;
  confirm: (action: ConfirmedAction) => void;
  schedule: () => void;
  copy: () => void;
}

function DocumentActions(props: DocumentActionProps) {
  const { model, confirm } = props;
  const {
    t,
    state: { snapshot },
    controller,
    busy,
    dirty,
    invalid,
    allowed,
  } = model;
  return (
    <>
      {allowed('documents.publish') ? (
        <Button
          variant="outline"
          disabled={busy || dirty || invalid}
          onClick={() => confirm('publish')}
        >
          <SendIcon aria-hidden="true" />
          {t.publish}
        </Button>
      ) : null}
      {snapshot?.document && snapshot.collection.history ? (
        <DocumentHistory
          document={snapshot.document}
          locale={snapshot.editor.locale}
          t={t}
          busy={busy}
          dirty={dirty}
          onRestore={(versionId) => {
            void controller.submit('restore', versionId);
          }}
        />
      ) : null}
      <DocumentMenu {...props} />
    </>
  );
}

function DocumentMenu({ model, confirm, schedule, copy }: DocumentActionProps) {
  const { t, state, busy, dirty, allowed } = model;
  const blocked = busy || dirty;
  const unpublish =
    Boolean(state.snapshot?.document?.publishedVersionId) && allowed('documents.unpublish');
  const copyable = allowed('documents.copy');
  const schedulable = allowed('content.schedulePublication') && model.canReadJob;
  const archivable = allowed('documents.archive') && model.canReadList;
  if (![unpublish, copyable, schedulable, archivable].some(Boolean)) return null;
  return (
    <Menu>
      <MenuTrigger render={<Button variant="outline" size="icon" aria-label={t.moreActions} />}>
        <EllipsisIcon aria-hidden="true" />
      </MenuTrigger>
      <MenuContent>
        {unpublish ? (
          <MenuItem disabled={blocked} onClick={() => confirm('unpublish')}>
            <Undo2Icon aria-hidden="true" />
            {t.unpublish}
          </MenuItem>
        ) : null}
        {copyable ? (
          <MenuItem disabled={blocked} onClick={copy}>
            <CopyIcon aria-hidden="true" />
            {t.copy}
          </MenuItem>
        ) : null}
        {schedulable ? (
          <MenuItem disabled={blocked} onClick={schedule}>
            <CalendarClockIcon aria-hidden="true" />
            {t.schedule}
          </MenuItem>
        ) : null}
        {archivable ? (
          <>
            <MenuSeparator />
            <MenuItem tone="destructive" disabled={blocked} onClick={() => confirm('archive')}>
              <Trash2Icon aria-hidden="true" />
              {t.archive}
            </MenuItem>
          </>
        ) : null}
      </MenuContent>
    </Menu>
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
