'use client';

import { CollectionViewNavigation, CollectionViewPresentation } from './custom-views';
import { EditorSlot } from './editor-customization';

import { useEffect, useRef, useState } from 'react';
import { Banner } from '@new-cms/ui/feedback';
import { InlineEditorSurface } from './inline-editor-surface';
import type { ReferenceEditorRequest } from '../fields/types';
import { FilePenLineIcon } from 'lucide-react';
import { RegisteredCollection } from '../admin-components/renderers';
import { CollectionPresentation } from '../admin-components/collection-presentation';
import { Card, CardContent, PageHeader } from '@new-cms/ui/layout';
import { UnsavedChangesGuard } from '../../components/cms/unsaved-changes';
import { FieldRenderer } from '../fields/field-renderer';
import { DocumentMedia } from '../assets/document-media';
import { useContentEditor } from './use-content-editor';
import type { ContentEditorModel, ContentEditorProps } from './use-content-editor';
import { DocumentAuthors } from './document-authors';
import { EditorFeedback } from './editor-feedback';
import { EditorActions, EditorToolbar } from './editor-controls';
import { EditorCollaboration } from './editor-collaboration';
import { DocumentPreviewPanel } from './document-preview';
import { PublicationLocalesField } from './publication-locales';
import { HierarchyParentEditor } from './hierarchy-parent';

export function ContentEditor(props: ContentEditorProps) {
  const model = useContentEditor({
    ...props,
    renderReferenceEditor: (request) => (
      <InlineReferenceEditor
        key={`${request.collection}:${request.id}:${request.locale}`}
        request={request}
      />
    ),
  });
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
      {props.embedded ? (
        <InlineEditorSurface
          title={snapshot?.collection.label ?? props.collectionKey}
          dirty={dirty || state.pending !== null}
          busy={busy}
          onClose={props.embedded.onClose}
          labels={labels}
        >
          <EditorPresentation model={model} />
        </InlineEditorSurface>
      ) : (
        <EditorPresentation model={model} />
      )}
    </UnsavedChangesGuard>
  );
}

function EditorPresentation({ model }: { model: ContentEditorModel }) {
  const { state, props } = model;
  const { snapshot } = state;
  const content = (
    <>
      <EditorBody model={model} />
      {props.embedded?.feedback}
    </>
  );
  if (!snapshot) return content;
  const editor = { ...snapshot.editor, componentProps: state.componentProps };
  return (
    <CollectionViewPresentation
      scope="document"
      path={props.viewPath}
      collection={snapshot.collection}
      document={snapshot.document}
      editor={editor}
      readOnly={snapshot.editor.intent === 'read'}
    >
      {!props.embedded ? (
        <CollectionViewNavigation
          scope="document"
          collection={snapshot.collection}
          document={snapshot.document}
          editor={editor}
          readOnly={snapshot.editor.intent === 'read'}
        />
      ) : null}
      <CollectionPresentation
        kind="edit"
        collection={snapshot.collection}
        document={snapshot.document}
        editor={editor}
        readOnly={snapshot.editor.intent === 'read'}
      >
        {content}
      </CollectionPresentation>
    </CollectionViewPresentation>
  );
}

function InlineReferenceEditor({ request }: { request: ReferenceEditorRequest }) {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [attachmentFailed, setAttachmentFailed] = useState(false);
  return (
    <ContentEditor
      collectionKey={request.collection}
      documentId={request.id}
      locale={request.locale}
      intent={request.id ? 'update' : 'create'}
      embedded={{
        onClose: request.onClose,
        onCommitted: (document) => {
          void request
            .onComplete({ collection: document.collection, id: document.id })
            .catch(() => false)
            .then((attached) => {
              if (!active.current) return attached;
              if (attached) request.onClose();
              else setAttachmentFailed(true);
              return attached;
            });
        },
        feedback: attachmentFailed ? (
          <Banner tone="warning">
            {request.locale.startsWith('zh')
              ? '内容已保存，但不符合此字段的筛选或读取权限。请调整后重试。'
              : 'Saved. This document does not meet this field’s filter or read access. Adjust it and try again.'}
          </Banner>
        ) : null,
      }}
    />
  );
}

function EditorBody({ model }: { model: ContentEditorModel }) {
  const { state, props, t } = model;
  const { snapshot } = state;
  const header = (
    <PageHeader
      className="sm:flex-col xl:flex-row"
      title={snapshot?.collection.label ?? props.collectionKey}
      description={
        snapshot ? (
          <EditorSlot model={model} slot="Description">
            {snapshot.document ? t.edit : t.create}
          </EditorSlot>
        ) : (
          t.create
        )
      }
      icon={<FilePenLineIcon />}
      actions={
        <div className="flex flex-wrap gap-2">
          <HierarchyParentEditor model={model} />
          <EditorActions model={model} />
        </div>
      }
    />
  );
  const content = (
    <>
      {snapshot ? (
        <RegisteredCollection
          slot="Header"
          collection={snapshot.collection}
          document={snapshot.document}
          editor={{ ...snapshot.editor, componentProps: state.componentProps }}
          readOnly={snapshot.editor.intent === 'read'}
        >
          {header}
        </RegisteredCollection>
      ) : (
        header
      )}
      <EditorFeedback model={model} />
      <EditorCollaboration model={model} />
      {snapshot ? (
        <>
          <EditorToolbar model={model} />
          <DocumentAuthors collection={snapshot.collection} document={snapshot.document} />
          <DocumentPreviewPanel model={model}>
            <CollectionViewPresentation
              scope="document"
              path="default"
              optional
              collection={snapshot.collection}
              document={snapshot.document}
              editor={{ ...snapshot.editor, componentProps: state.componentProps }}
              readOnly={snapshot.editor.intent === 'read'}
            >
              <EditorFields model={model} />
            </CollectionViewPresentation>
            <EditorMedia model={model} />
          </DocumentPreviewPanel>
        </>
      ) : null}
    </>
  );
  return content;
}

function EditorMedia({ model }: { model: ContentEditorModel }) {
  const { state, props } = model;
  const { snapshot } = state;
  if (!snapshot) return null;
  const visible =
    snapshot.collection.upload ||
    Boolean(snapshot.document?.file) ||
    Boolean(snapshot.document?.mediaBindings?.some((binding) => binding.sourcePath !== '$file'));
  if (!visible) return null;
  return (
    <EditorSlot model={model} slot="Upload">
      <DocumentMedia
        collection={snapshot.collection}
        editor={{ ...snapshot.editor, componentProps: state.componentProps }}
        document={snapshot.document}
        busy={state.busy || state.pending !== null || model.lease.blocked}
        editorSessionId={model.editorSessionId}
        onBusyChange={model.controller.setExternalBusy}
        onUploadReady={model.controller.setUpload}
        onDocumentChanged={() => model.controller.reload(true)}
        {...(props.initialUploadId ? { initialUploadId: props.initialUploadId } : {})}
      />
    </EditorSlot>
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
          layout={
            snapshot.collection.hierarchy?.useHeaderButton
              ? snapshot.editor.layout.filter(
                  (node) => node.name !== snapshot.collection.hierarchy?.parentFieldName,
                )
              : snapshot.editor.layout
          }
          value={state.value}
          onChange={controller.change}
          onValidityChange={controller.validity}
          locale={snapshot.editor.locale}
          services={services}
          readOnly={
            snapshot.editor.intent === 'read' || state.phase !== 'ready' || model.lease.blocked
          }
          errors={{ ...errors, ...state.errors }}
          richTextNodes={snapshot.editor.richTextNodes}
          renderControl={(input) =>
            snapshot.editor.publicationLocalesField &&
            input.node.path === snapshot.editor.publicationLocalesField ? (
              <PublicationLocalesField
                {...input}
                locales={snapshot.editor.locales.supported}
                t={model.t}
              />
            ) : undefined
          }
          visibility={state.visibility}
          componentProps={state.componentProps}
          choiceOptions={state.choiceOptions}
        />
      </CardContent>
    </Card>
  );
}
