'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useShell } from '../../components/shell/shell-provider';
import { collectionListSchema } from '../../contracts/content';
import type { OperationId } from '../../contracts/operations';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ReferenceMediaPreview } from '../assets/document-media';
import { createContentEditor, editorDirty } from './editor-controller';
import { readEditor, readArchivedDocument } from './editor-read';
import { writeEditor } from './editor-write';
import { contentMessages } from './messages';
import { collectionHref } from './query';
import { referenceServices } from './reference-services';
import { contentEditorPolicy } from './policy';

export interface ContentEditorProps {
  collectionKey: string;
  documentId: string | null;
  locale: string | null;
  intent: 'create' | 'update' | 'read';
  initialUploadId?: string | undefined;
}

export function useContentEditor(props: ContentEditorProps) {
  const { collectionKey, documentId, locale, intent } = props;
  const language = useShell((state) => state.locale);
  const t = contentMessages[language];
  const access = useAccessControl();
  const navigation = useAppNavigation();
  const [destination, setDestination] = useState<string | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const { replace } = navigation;
  const [controller] = useState(() =>
    createContentEditor({
      target: { collection: collectionKey, id: documentId, locale, intent },
      load: readEditor,
      readArchived: readArchivedDocument,
      write: writeEditor,
      createId: () => crypto.randomUUID(),
      report: access.reportResult,
      onCreated: (document) => {
        setDestination(
          `${collectionHref(collectionKey, document.id)}${locale ? `?locale=${encodeURIComponent(locale)}` : ''}`,
        );
      },
      onArchived: () => {
        setDestination(`${collectionHref(collectionKey)}?trashed=true`);
      },
    }),
  );
  const state = useStore(controller.store);
  const [autosave, setAutosave] = useState(false);
  const catalog = useApiQuery({
    operation: 'collections.list',
    response: collectionListSchema,
    enabled: access.can('collections.list'),
  });
  const source = state.snapshot?.document;
  const services = useMemo(
    () => ({
      ...referenceServices(catalog.data?.rows ?? [], access.reportResult),
      renderPreview: (input: {
        reference: { collection: string; id: string };
        sourcePath: string;
      }) =>
        source ? (
          <ReferenceMediaPreview
            document={source}
            reference={input.reference}
            sourcePath={input.sourcePath}
          />
        ) : null,
    }),
    [catalog.data, access.reportResult, source],
  );
  const dirty = editorDirty(state);
  const busy = state.busy || state.externalBusy || state.pending !== null;
  const invalid = Object.keys(state.errors).length > 0;
  const scope = { scopeKind: 'collection', collectionKey } as const;
  function allowed(operation: OperationId) {
    return (
      state.phase === 'ready' &&
      access.can(operation, scope) &&
      state.snapshot?.editor.actions.some(
        (action) => action.operationId === operation && action.state !== 'denied',
      ) === true
    );
  }
  const canAutosave = allowed('documents.autosave');
  useEffect(() => {
    void controller.start();
    return () => controller.dispose();
  }, [controller]);
  useEffect(() => {
    if (destination && !dirty && !busy && !copyOpen) replace(destination);
  }, [destination, dirty, busy, copyOpen, replace]);
  const { generation, failure: currentFailure, snapshot: currentSnapshot } = state;
  useEffect(() => {
    if (
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
    }, contentEditorPolicy.autosaveDelayMs);
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
    services,
    dirty,
    busy,
    invalid,
    allowed,
    autosave,
    setAutosave,
    copyOpen,
    setCopyOpen,
    navigation,
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

export type ContentEditorModel = ReturnType<typeof useContentEditor>;
