'use client';

import { EditorSlot } from './editor-customization';
import { DocumentMenu } from './editor-menu';

import { useState } from 'react';
import { ArrowLeftIcon, CheckIcon, CircleDotIcon, SaveIcon, SendIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Field, NativeSelect, Switch } from '@new-cms/ui/forms';
import { ManagementDialog } from '../management-shared/management-dialog';
import { CopyLocaleDialog } from './copy-locale-dialog';
import { CopyDocumentDialog } from './copy-document-dialog';
type ConfirmedAction = 'publish' | 'unpublish' | 'archive';
import type { ContentEditorModel } from './use-content-editor';
import { collectionHref } from './query';
import { FolderSelect } from './folders';
import { PublicationSchedule } from './schedule';
import { DocumentHistory } from './history';
import { StatusCell } from '@new-cms/ui/data';
import { documentStatus } from './document-status';
import { DefaultLanguageControl } from './languages/default-language';
import { ContentPreviewControl } from './preview/content-preview';

function editorStatus(model: ContentEditorModel) {
  if (model.busy) return model.t.saving;
  if (model.dirty) return model.t.dirty;
  return model.state.saved ? model.t.saved : '';
}

export function EditorToolbar({ model }: { model: ContentEditorModel }) {
  const { state, props, controller, navigation, t, busy, allowed } = model;
  const { snapshot } = state;
  if (!snapshot) return null;
  const status = snapshot.document
    ? documentStatus(snapshot.document, snapshot.collection, { t })
    : null;
  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-border/50 xl:flex-row xl:items-center xl:justify-between">
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(8rem,10rem)_minmax(10rem,18rem)] [&_select]:w-full">
        <Field id="editor-locale" label={t.locale} className="min-w-0">
          <NativeSelect
            className="w-full"
            value={snapshot.editor.locale}
            disabled={busy || Boolean(props.embedded)}
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
          disabled={busy || snapshot.editor.intent === 'read' || model.lease.blocked}
        />
      </div>
      <EditorSlot model={model} slot="BeforeDocumentMeta" />
      <div className="flex min-h-8 flex-wrap items-center gap-x-5 gap-y-3 border-t border-border/60 pt-4 xl:border-t-0 xl:border-l xl:pl-5 xl:pt-0">
        {status ? (
          <EditorSlot model={model} slot="Status">
            <StatusCell tone={status.tone}>{status.label}</StatusCell>
          </EditorSlot>
        ) : null}
        {snapshot.editor.intent === 'read' ? (
          <span className="text-sm text-muted-foreground">{t.readOnly}</span>
        ) : null}
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
  const [localeCopy, setLocaleCopy] = useState(false);
  const { state, t, controller, busy, dirty, invalid } = model;
  const { snapshot } = state;
  return (
    <>
      <EditorActionButtons
        model={model}
        confirm={setConfirm}
        schedule={() => setSchedule(true)}
        copyLocale={() => {
          setLocaleCopy(true);
          controller.setExternalBusy(true);
        }}
      />
      {localeCopy && snapshot ? (
        <CopyLocaleDialog
          snapshot={snapshot}
          editorSessionId={model.editorSessionId}
          onClose={() => {
            setLocaleCopy(false);
            controller.setExternalBusy(false);
          }}
          onRefresh={() => {
            setLocaleCopy(false);
            controller.setExternalBusy(false);
            void controller.reload();
          }}
          onCopied={(locale, id) => {
            setLocaleCopy(false);
            controller.setExternalBusy(false);
            model.openLocale(id, locale);
          }}
        />
      ) : null}
      {schedule && snapshot?.document ? (
        <PublicationSchedule
          document={snapshot.document}
          locale={snapshot.editor.locale}
          canPublish={model.allowed('documents.publish')}
          canUnpublish={model.allowed('documents.unpublish')}
          t={t}
          onClose={() => setSchedule(false)}
          onBusyChange={controller.setExternalBusy}
        />
      ) : null}
      {model.copyOpen && snapshot ? (
        <CopyDocumentDialog
          snapshot={snapshot}
          collections={model.referenceCollections}
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
  copyLocale,
}: {
  model: ContentEditorModel;
  confirm: (action: ConfirmedAction) => void;
  schedule: () => void;
  copyLocale: () => void;
}) {
  const {
    state: { snapshot },
    t,
    controller,
    allowed,
  } = model;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <EditorSlot model={model} slot="beforeDocumentControls" />
      {!model.props.embedded ? (
        <Button
          variant="ghost"
          onClick={() => model.navigation.push(collectionHref(model.props.collectionKey))}
        >
          <ArrowLeftIcon aria-hidden="true" />
          {t.back}
        </Button>
      ) : null}
      {snapshot && allowed(snapshot.document ? 'documents.update' : 'documents.create') ? (
        <EditorSlot
          model={model}
          slot={snapshot.collection.capabilities.publication ? 'SaveDraftButton' : 'SaveButton'}
          disabled={saveBlocked(model)}
          onAction={() => {
            void controller.submit('save');
          }}
        >
          <Button
            disabled={saveBlocked(model)}
            onClick={() => {
              void controller.submit('save');
            }}
          >
            <SaveIcon aria-hidden="true" />
            {t.save}
          </Button>
        </EditorSlot>
      ) : null}
      {snapshot?.document ? (
        <DocumentActions
          model={model}
          confirm={confirm}
          schedule={schedule}
          copy={() => model.setCopyOpen(true)}
          copyLocale={copyLocale}
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

export interface DocumentActionProps {
  model: ContentEditorModel;
  confirm: (action: ConfirmedAction) => void;
  schedule: () => void;
  copy: () => void;
  copyLocale: () => void;
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
      <DocumentPresentationActions model={model} />
      {allowed('documents.publish') ? (
        <EditorSlot
          model={model}
          slot="PublishButton"
          disabled={busy || dirty || invalid}
          onAction={() => confirm('publish')}
        >
          <Button
            variant="outline"
            disabled={busy || dirty || invalid}
            onClick={() => confirm('publish')}
          >
            <SendIcon aria-hidden="true" />
            {t.publish}
          </Button>
        </EditorSlot>
      ) : null}
      {snapshot?.document && snapshot.collection.history ? (
        <DocumentHistory
          document={snapshot.document}
          collection={snapshot.collection}
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

function saveBlocked(model: ContentEditorModel) {
  return (
    model.busy ||
    model.invalid ||
    (model.state.snapshot?.document !== null && !model.dirty) ||
    model.state.failure?.error.code === 'version_conflict'
  );
}

function DocumentPresentationActions({ model }: { model: ContentEditorModel }) {
  const {
    state: { snapshot },
    t,
    busy,
    dirty,
    invalid,
    controller,
  } = model;
  if (!snapshot?.document) return null;
  return (
    <>
      {snapshot.document ? (
        <EditorSlot model={model} slot="PreviewButton" disabled={busy || dirty || invalid}>
          <ContentPreviewControl
            key={`${snapshot.document.id}:${snapshot.document.revision}:${snapshot.editor.locale}`}
            target={{
              collection: snapshot.collection.key,
              id: snapshot.document.id,
              revision: snapshot.document.revision,
              locale: snapshot.editor.locale,
            }}
            disabled={busy || dirty || invalid}
            permitted={model.canPreview}
            canRevoke={model.canRevokePreview}
            t={t}
            report={model.reportResult}
          />
        </EditorSlot>
      ) : null}
      {snapshot.document ? (
        <DefaultLanguageControl
          key={`${snapshot.document.id}:${snapshot.document.revision}`}
          document={snapshot.document}
          permitted={model.canSetDefaultLanguage}
          disabled={busy || dirty || invalid}
          onChanged={() => {
            void controller.reload();
          }}
          onBusy={controller.setExternalBusy}
          report={model.reportResult}
          t={t}
        />
      ) : null}
    </>
  );
}
