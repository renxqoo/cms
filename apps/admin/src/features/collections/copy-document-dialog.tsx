'use client';

import { useEffect, useMemo, useState } from 'react';
import { Banner } from '@new-cms/ui/feedback';
import { Field, NativeSelect } from '@new-cms/ui/forms';
import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import { useShell } from '../../components/shell/shell-provider';
import { collectionEditorSchema } from '../../contracts/editor';
import type { CollectionEditor } from '../../contracts/editor';
import { documentSchema } from '../../contracts/documents';
import type { Document } from '../../contracts/documents';
import { useAccessControl } from '../access-control/provider';
import { FieldRenderer } from '../fields/field-renderer';
import type { FieldData } from '../fields/types';
import type { Collection } from '../../contracts/content';
import { writablePatch } from '../fields/writable-data';
import { ManagementDialog } from '../management-shared/management-dialog';
import { ManagementFeedback } from '../management-shared/feedback';
import type { EditorFailure } from './editor-controller';
import type { EditorSnapshot } from './editor-read';
import { copyFieldData } from '../fields/copy-data';
import { synchronizeSharedValues } from './copy-localization';
import { useCandidatePresentation, usePresentationValidity } from './use-candidate-presentation';
import { useEditorReferences } from './use-editor-references';

interface CopyDocumentDialogProps {
  snapshot: EditorSnapshot;
  collections: readonly Collection[];
  busy: boolean;
  failure: EditorFailure | null;
  onClose: () => void;
  onCopy: (dataByLocale: Record<string, FieldData>) => Promise<boolean>;
}
interface CopySource {
  editor: CollectionEditor;
  document: Document;
}
interface SourcesState {
  attempt: number;
  phase: 'loading' | 'ready' | 'failed';
  records: Record<string, CopySource>;
  error: EditorFailure | null;
}
const messages = {
  zh: {
    title: '复制文档',
    description: '检查各语言的副本字段；唯一值需要修改后才能保存副本。',
    changed: '源文档或复制权限已变化，请关闭后重新读取当前文档。',
    loading: '正在读取复制字段…',
    locale: '副本语言',
    retry: '核实同一次复制请求',
  },
  en: {
    title: 'Copy document',
    description: 'Review each language. Change unique values before saving the copy.',
    changed: 'The source or copy permissions changed. Close this dialog and reload the document.',
    loading: 'Loading copy fields…',
    locale: 'Copy language',
    retry: 'Verify the same copy request',
  },
};

function matchingCollection(source: EditorSnapshot, editor: CollectionEditor) {
  const { collection } = source;
  return (
    editor.collection === collection.key &&
    editor.schemaVersion === collection.schemaVersion &&
    editor.behaviorHash === collection.behaviorHash &&
    editor.mappingFingerprint === collection.mappingFingerprint
  );
}

function matchingCopy(source: EditorSnapshot, value: CopySource, locale: string) {
  const { document, collection } = source;
  const { editor, document: current } = value;
  return (
    document !== null &&
    editor.intent === 'copy' &&
    editor.mode === 'editing' &&
    editor.locale === locale &&
    matchingCollection(source, editor) &&
    current.id === document.id &&
    current.collection === collection.key &&
    current.revision === document.revision &&
    current.versionId === document.versionId &&
    current.trashedAt === null &&
    editor.document?.id === current.id &&
    editor.document.revision === current.revision &&
    editor.document.versionId === current.versionId &&
    editor.actions.some(
      (action) => action.operationId === 'documents.copy' && action.state !== 'denied',
    )
  );
}

async function readCopySource(
  source: EditorSnapshot,
  locale: string,
  signal: AbortSignal,
): Promise<ApiResult<CopySource>> {
  const id = source.document?.id;
  if (!id) return failure('invalid_input', 400);
  const editor = await requestApi({
    operation: 'collections.editor',
    params: { collection: source.collection.key },
    query: { intent: 'copy', id, locale, mode: 'editing' },
    response: collectionEditorSchema,
    signal,
  });
  if (!editor.ok) return editor;
  const document = await requestApi({
    operation: 'documents.get',
    params: { collection: source.collection.key, id },
    query: { locale, fallback: [], depth: 0, mode: 'editing' },
    response: documentSchema,
    signal,
  });
  if (!document.ok) return document;
  const value = {
    editor: editor.data,
    document: { ...document.data, data: copyFieldData(editor.data.layout, document.data.data) },
  };
  return matchingCopy(source, value, locale)
    ? { ok: true, status: 200, requestId: document.requestId, data: value }
    : failure('version_conflict', 409);
}

async function readCopySources(
  source: EditorSnapshot,
  signal: AbortSignal,
): Promise<ApiResult<Record<string, CopySource>>> {
  const records: Record<string, CopySource> = {};
  for (const locale of source.editor.locales.supported) {
    const result = await readCopySource(source, locale, signal);
    if (!result.ok) return result;
    records[locale] = result.data;
  }
  return { ok: true, status: 200, requestId: '', data: records };
}

function useCopySources(source: EditorSnapshot, allowed: boolean) {
  const { reportResult } = useAccessControl();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SourcesState>({
    attempt: -1,
    phase: 'loading',
    records: {},
    error: null,
  });
  useEffect(() => {
    if (!allowed) return () => {};
    const controller = new AbortController();
    void readCopySources(source, controller.signal)
      .catch(() => failure('invalid_response', 0))
      .then((result) => {
        if (controller.signal.aborted) return result;
        reportResult(result);
        setState((current) =>
          result.ok
            ? { attempt, phase: 'ready', records: result.data, error: null }
            : { ...current, attempt, phase: 'failed', error: result },
        );
        return result;
      });
    return () => controller.abort();
  }, [source, allowed, attempt, reportResult]);
  return {
    ...state,
    phase: state.attempt === attempt ? state.phase : 'loading',
    reload: () => setAttempt((value) => value + 1),
  };
}

function withoutError(errors: Record<string, string>, key: string, error: string | null) {
  const { [key]: _removed, ...rest } = errors;
  return error === null ? rest : { ...rest, [key]: error };
}

function CopyFeedback(props: {
  state: ReturnType<typeof useCopySources>;
  failure: EditorFailure | null;
  allowed: boolean;
  current: boolean;
  language: 'zh' | 'en';
}) {
  const t = messages[props.language];
  return (
    <>
      <ManagementFeedback error={props.state.error} onRetry={props.state.reload} />
      <ManagementFeedback error={props.failure} />
      {props.state.phase === 'loading' && props.allowed ? <p role="status">{t.loading}</p> : null}
      {(!props.allowed || !props.current) && !props.state.error ? (
        <Banner tone="warning">{t.changed}</Banner>
      ) : null}
    </>
  );
}

export function CopyDocumentDialog(props: CopyDocumentDialogProps) {
  const [source] = useState(props.snapshot);
  const { can } = useAccessControl();
  const language = useShell((state) => state.locale);
  const t = messages[language];
  const scope = { scopeKind: 'collection', collectionKey: source.collection.key } as const;
  const allowed =
    !source.collection.disableDuplicate &&
    ['collections.editor', 'documents.get', 'documents.copy'].every((operation) =>
      can(operation, scope),
    );
  const state = useCopySources(source, allowed);
  const [locale, setLocale] = useState(source.editor.locale);
  const [values, setValues] = useState<Record<string, FieldData>>({});
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [sending, setSending] = useState(false);
  const versionId = source.document?.versionId;
  const uncertain = props.failure?.uncertain === true;
  const current = versionId === props.snapshot.document?.versionId;
  const ready = allowed && current && state.phase === 'ready';
  const invalid = Object.values(errors).some((entry) => Object.keys(entry).length > 0);
  const patches = Object.fromEntries(
    Object.entries(state.records).map(([key, entry]) => [
      key,
      writablePatch(entry.editor.layout, entry.document.data, values[key] ?? entry.document.data),
    ]),
  );
  const dirty = invalid || Object.values(patches).some((patch) => Object.keys(patch).length > 0);
  async function copy() {
    if (!ready || sending || props.busy || invalid) return;
    setSending(true);
    try {
      if (await props.onCopy(patches)) props.onClose();
    } finally {
      setSending(false);
    }
  }
  return (
    <ManagementDialog
      open
      onClose={props.onClose}
      title={t.title}
      description={t.description}
      submitLabel={uncertain ? t.retry : t.title}
      pending={props.busy || sending}
      locked={uncertain}
      disabled={!ready || invalid}
      dirty={dirty}
      onSubmit={() => {
        void copy();
      }}
      feedback={
        <CopyFeedback
          state={state}
          failure={props.failure}
          allowed={allowed}
          current={current}
          language={language}
        />
      }
    >
      <Field id="copy-locale" label={t.locale}>
        <NativeSelect value={locale} onChange={(event) => setLocale(event.currentTarget.value)}>
          {source.editor.locales.supported.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {Object.entries(allowed ? state.records : {}).map(([key, entry]) => (
        <CopyLocaleFields
          key={key}
          source={source}
          entry={entry}
          collections={props.collections}
          active={locale === key}
          value={values[key] ?? entry.document.data}
          onChange={(value) =>
            setValues((previous) =>
              Object.fromEntries(
                Object.entries(state.records).map(([targetLocale, target]) => [
                  targetLocale,
                  targetLocale === key
                    ? value
                    : synchronizeSharedValues({
                        layout: entry.editor.layout,
                        before: previous[key] ?? entry.document.data,
                        next: value,
                        other: previous[targetLocale] ?? target.document.data,
                      }),
                ]),
              ),
            )
          }
          onValidityChange={(name, error) =>
            setErrors((previous) => ({
              ...previous,
              [key]: withoutError(previous[key] ?? {}, name, error),
            }))
          }
          errors={errors[key] ?? {}}
          readOnly={!ready}
        />
      ))}
    </ManagementDialog>
  );
}

function CopyLocaleFields(props: {
  source: EditorSnapshot;
  entry: CopySource;
  collections: readonly Collection[];
  active: boolean;
  value: FieldData;
  onChange: (value: FieldData) => void;
  onValidityChange: (name: string, error: string | null) => void;
  errors: Record<string, string>;
  readOnly: boolean;
}) {
  const { source, entry, active } = props;
  const language = useShell((state) => state.locale);
  const { reportResult } = useAccessControl();
  const snapshot = useMemo(
    () => ({ ...source, editor: entry.editor, document: entry.document }),
    [source, entry],
  );
  const presentation = useCandidatePresentation({
    snapshot,
    data: props.value,
    active,
    report: reportResult,
  });
  usePresentationValidity({
    busy: presentation.previewBusy,
    failed: presentation.previewFailure !== null,
    report: props.onValidityChange,
    message: messages[language].loading,
  });
  const services = useEditorReferences({
    snapshot,
    data: props.value,
    collections: props.collections,
    report: reportResult,
  });
  return (
    <div hidden={!active} inert={!active}>
      {presentation.previewBusy ? <p role="status">{messages[language].loading}</p> : null}
      <ManagementFeedback error={presentation.previewFailure} onRetry={presentation.retry} />
      <FieldRenderer
        idPrefix={`copy-document-${entry.editor.locale}`}
        resetKey={`copy:${entry.document.versionId}:${entry.editor.locale}`}
        active={active}
        layout={entry.editor.layout}
        value={props.value}
        onChange={props.onChange}
        onValidityChange={props.onValidityChange}
        locale={entry.editor.locale}
        services={services}
        errors={props.errors}
        richTextNodes={entry.editor.richTextNodes}
        visibility={presentation.visibility}
        componentProps={presentation.componentProps}
        choiceOptions={presentation.choiceOptions}
        readOnly={props.readOnly}
      />
    </div>
  );
}
