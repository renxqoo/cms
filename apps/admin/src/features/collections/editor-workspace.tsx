'use client';

import { FilePenLineIcon } from 'lucide-react';
import { Card, CardContent, PageHeader } from '@new-cms/ui/layout';
import { UnsavedChangesGuard } from '../../components/cms/unsaved-changes';
import { FieldRenderer } from '../fields/field-renderer';
import { DocumentMedia } from '../assets/document-media';
import { useContentEditor } from './use-content-editor';
import type { ContentEditorModel, ContentEditorProps } from './use-content-editor';
import { EditorFeedback } from './editor-feedback';
import { EditorActions, EditorToolbar } from './editor-controls';

export function ContentEditor(props: ContentEditorProps) {
  const model = useContentEditor(props);
  const { t, state, dirty, busy, navigation } = model;
  const { snapshot } = state;
  const labels = {
    title: t.leaveTitle,
    description: t.leaveDescription,
    confirm: t.leave,
    cancel: t.stay,
    close: t.close,
  };
  return (
    <UnsavedChangesGuard dirty={dirty || busy} navigation={navigation.adapter} labels={labels}>
      <PageHeader
        className="sm:flex-col xl:flex-row"
        title={snapshot?.collection.label ?? props.collectionKey}
        description={snapshot?.document ? t.edit : t.create}
        icon={<FilePenLineIcon />}
        actions={<EditorActions model={model} />}
      />
      <EditorFeedback model={model} />
      {snapshot ? (
        <>
          <EditorToolbar model={model} />
          <EditorFields model={model} />
          <DocumentMedia
            collection={snapshot.collection}
            editor={snapshot.editor}
            document={snapshot.document}
            busy={state.busy || state.pending !== null}
            onBusyChange={model.controller.setExternalBusy}
            onUploadReady={model.controller.setUpload}
            onDocumentChanged={() => model.controller.reload(true)}
            {...(props.initialUploadId ? { initialUploadId: props.initialUploadId } : {})}
          />
        </>
      ) : null}
    </UnsavedChangesGuard>
  );
}

function EditorFields({ model }: { model: ContentEditorModel }) {
  const { state, controller, props, services } = model;
  const { snapshot } = state;
  if (!snapshot) return null;
  const errors = Object.fromEntries(
    (state.failure?.error.fieldErrors ?? []).map((error) => [
      error.field.replace(/^data\./, ''),
      error.message,
    ]),
  );
  return (
    <Card>
      <CardContent className="pt-6">
        <FieldRenderer
          idPrefix={`document-${props.documentId ?? 'new'}`}
          resetKey={`${state.resetEpoch}:${snapshot.editor.locale}`}
          layout={snapshot.editor.layout}
          value={state.value}
          onChange={controller.change}
          onValidityChange={controller.validity}
          locale={snapshot.editor.locale}
          services={services}
          readOnly={props.intent === 'read' || state.phase !== 'ready'}
          errors={{ ...errors, ...state.errors }}
          richTextNodes={snapshot.editor.richTextNodes}
        />
      </CardContent>
    </Card>
  );
}
