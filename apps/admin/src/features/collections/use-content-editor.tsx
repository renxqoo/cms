'use client';

import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useShell } from '../../components/shell/shell-provider';
import type { Collection } from '../../contracts/content';
import { collectionListSchema } from '../../contracts/content';
import type { OperationId } from '../../contracts/operations';
import type { Document } from '../../contracts/documents';
import type { FieldServices } from '../fields/types';
import type { EditorSnapshot } from './editor-read';
import { useAccessControl } from '../access-control/provider';
import { useAdminComponents } from '../admin-components/registry';
import { previewEditor as previewConditions } from './editor-preview';
import { useApiQuery } from '../management-shared/query';
import { useEditorReferences } from './use-editor-references';
import { createContentEditor, editorDirty } from './editor-controller';
import { readEditor, readArchivedDocument } from './editor-read';
import { writeEditor } from './editor-write';
import { contentMessages } from './messages';
import { collectionHref } from './query';
import { useEditorLease } from './use-editor-lease';

export interface ContentEditorProps {
  collectionKey: string;
  documentId: string | null;
  locale: string | null;
  intent: 'create' | 'update' | 'read';
  viewPath?: string | undefined;
  initialUploadId?: string | undefined;
  editorSessionId?: string;
  embedded?: {
    onClose: () => void;
    onCommitted: (document: Document) => void;
    feedback?: React.ReactNode;
  };
  renderReferenceEditor?: FieldServices['renderReferenceEditor'];
}

export function useContentEditor(props: ContentEditorProps) {
  const { collectionKey, documentId, locale, intent } = props;
  const language = useShell((state) => state.locale);
  const t = contentMessages[language];
  const access = useAccessControl();
  const components = useAdminComponents();
  const navigation = useAppNavigation();
  const [destination, setDestination] = useState<{ href: string; replace: boolean } | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [editorSessionId] = useState(() => props.editorSessionId ?? crypto.randomUUID());
  const { replace, push } = navigation;
  const [controller] = useState(() =>
    createContentEditor({
      target: { collection: collectionKey, id: documentId, locale, intent },
      load: (target, signal) => readEditor(target, signal, components),
      readArchived: readArchivedDocument,
      write: (input, signal, replay) => writeEditor({ ...input, editorSessionId }, signal, replay),
      preview: previewConditions,
      createId: () => crypto.randomUUID(),
      report: access.reportResult,
      onCommitted: (document) => props.embedded?.onCommitted(document),
      ...editorNavigation(props, setDestination),
    }),
  );
  const state = useStore(controller.store);
  const [autosave, setAutosave] = useState(false);
  const catalog = useApiQuery({
    operation: 'collections.list',
    query: { locale: editorCatalogLocale(state.snapshot, locale) },
    response: collectionListSchema,
    enabled: access.can('collections.list'),
  });
  const source = state.snapshot?.document;
  const previewEditor = state.snapshot?.editor;
  const lease = useEditorLease({
    collection: collectionKey,
    id: source?.id ?? null,
    editorId: editorSessionId,
    locale: state.snapshot?.editor.locale ?? '',
    enabled: editorLeaseEnabled(documentId, previewEditor),
    report: access.reportResult,
  });
  const services = useEditorReferences({
    snapshot: state.snapshot,
    data: state.value,
    collections: catalog.data?.rows ?? [],
    report: access.reportResult,
  });
  const dirty = editorDirty(state);
  const busy = state.busy || state.externalBusy || state.pending !== null;
  const invalid = Object.keys(state.errors).length > 0;
  const scope = { scopeKind: 'collection', collectionKey } as const;
  function allowed(operation: OperationId) {
    return (
      state.phase === 'ready' &&
      (!lease.blocked || ['documents.copy', 'documents.create'].includes(operation)) &&
      access.can(operation, scope) &&
      state.snapshot?.editor.actions.some(
        (action) => action.operationId === operation && action.state !== 'denied',
      ) === true
    );
  }
  const canAutosave = allowed('documents.autosave');
  const leaseFailure = state.failure?.error.code;
  const retryLease = lease.retry;
  useEffect(() => {
    if (leaseFailure === 'document_locked') void retryLease();
  }, [leaseFailure, retryLease]);
  useEffect(() => {
    void controller.start();
    return () => controller.dispose();
  }, [controller]);
  useEffect(() => {
    if (!destination || dirty || busy || copyOpen) return;
    if (destination.replace) replace(destination.href);
    else push(destination.href);
  }, [destination, dirty, busy, copyOpen, replace, push]);
  const { generation, failure: currentFailure, snapshot: currentSnapshot } = state;
  useEffect(() => {
    const configured = currentSnapshot?.collection.drafts?.autosave;
    if (
      !configured ||
      !autosave ||
      !dirty ||
      invalid ||
      busy ||
      currentFailure ||
      !currentSnapshot?.document ||
      !currentSnapshot.collection.capabilities.autosave ||
      !canAutosave
    )
      return () => {};
    const timer = setTimeout(() => {
      if (controller.store.getState().generation === generation) void controller.submit('autosave');
    }, configured.intervalMs);
    return () => clearTimeout(timer);
  }, [
    autosave,
    dirty,
    invalid,
    busy,
    currentFailure,
    generation,
    currentSnapshot,
    canAutosave,
    controller,
  ]);
  return {
    props,
    t,
    state,
    controller,
    services: referenceEditorServices({
      services,
      render: props.renderReferenceEditor,
      access,
      collections: catalog.data?.rows,
      sourceAllowed: sourceReferenceAllowed(state.snapshot, allowed),
    }),
    referenceCollections: catalog.data?.rows ?? [],
    dirty,
    busy,
    invalid,
    allowed,
    autosave,
    setAutosave,
    copyOpen,
    setCopyOpen,
    openLocale: (id: string, targetLocale: string) =>
      setDestination({
        href: `${collectionHref(collectionKey, id)}?locale=${encodeURIComponent(targetLocale)}`,
        replace: false,
      }),
    navigation,
    lease,
    editorSessionId,
    ...editorCapabilities({ access, collectionKey, allowed }),
  };
}

function editorNavigation(
  props: ContentEditorProps,
  setDestination: (target: { href: string; replace: boolean }) => void,
) {
  return {
    onCreated(document: Document) {
      if (props.embedded) {
        props.embedded.onCommitted(document);
        return;
      }
      setDestination({
        href: `${collectionHref(props.collectionKey, document.id)}${props.locale ? `?locale=${encodeURIComponent(props.locale)}` : ''}`,
        replace: true,
      });
    },
    onArchived() {
      if (props.embedded) {
        props.embedded.onClose();
        return;
      }
      setDestination({
        href: `${collectionHref(props.collectionKey)}?trashed=true`,
        replace: true,
      });
    },
  };
}

function sourceReferenceAllowed(
  snapshot: EditorSnapshot | null,
  allowed: (operation: OperationId) => boolean,
): boolean {
  return allowed(snapshot?.document ? 'documents.update' : 'documents.create');
}

function referenceEditorServices(input: {
  services: FieldServices;
  render: FieldServices['renderReferenceEditor'];
  access: ReturnType<typeof useAccessControl>;
  collections: readonly Collection[] | undefined;
  sourceAllowed: boolean;
}): FieldServices {
  return {
    ...input.services,
    ...(input.render ? { renderReferenceEditor: input.render } : {}),
    canEditReference: (key, action) => {
      if (!input.sourceAllowed || !input.collections?.some((collection) => collection.key === key))
        return false;
      const scope = { scopeKind: 'collection', collectionKey: key } as const;
      return [
        'collections.get',
        'collections.editor',
        'documents.get',
        action === 'create' ? 'documents.create' : 'documents.update',
      ].every((operation) => input.access.can(operation, scope));
    },
  };
}

function editorCapabilities(input: {
  access: ReturnType<typeof useAccessControl>;
  collectionKey: string;
  allowed: (operation: OperationId) => boolean;
}) {
  const { access, collectionKey, allowed } = input;
  const scope = { scopeKind: 'collection', collectionKey } as const;
  return {
    canReadJob: access.can('content.getJob', scope),
    canReadList: access.can('documents.list', scope),
    canSetDefaultLanguage:
      collectionKey === 'languages' &&
      access.can('languages.setDefault', scope) &&
      access.can('documents.list', scope) &&
      allowed('documents.update'),
    canPreview:
      access.can('documents.createPreviewTicket', scope) && access.can('documents.get', scope),
    canRevokePreview: access.can('documents.revokePreviewTicket', scope),
    reportResult: access.reportResult,
  };
}

function editorLeaseEnabled(
  documentId: string | null,
  editor: EditorSnapshot['editor'] | undefined,
) {
  return documentId !== null && editor?.intent === 'update' && Boolean(editor.collaboration);
}

export type ContentEditorModel = ReturnType<typeof useContentEditor>;

function editorCatalogLocale(snapshot: EditorSnapshot | null, locale: string | null) {
  return snapshot?.editor.locale ?? locale;
}
