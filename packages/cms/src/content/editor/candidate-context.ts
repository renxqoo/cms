import { policyScope } from '../hooks/invoke.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import { createRunner, policyContext, requireRevision } from '../runtime.ts';
import { assertJsonBudget } from '../fields/data-budget.ts';
import { normalizeLocaleData } from '../fields/normalize-locale-data.ts';
import { assertWritableData } from '../fields/policy-write.ts';
import { projectData } from '../fields/policy-read.ts';
import { snapshotPatch } from '../documents/snapshot-patch.ts';
import { projectReadData } from '../documents/project-data.ts';
import { immutable } from '../fields/invoke-function.ts';
import { editorContext } from './context.ts';
import { editorLayout } from './layout.ts';
import { readInitialSnapshot } from './initial-snapshot.ts';
import { mergeCandidateValues, editorSourceData } from './candidate-values.ts';
import { candidateSibling } from '../fields/sibling-data.ts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import type { DocumentData } from '../definition.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { EditorContext } from './context.ts';
import type { EditorCandidateInput } from './candidate-input.ts';

export interface EditorCandidateContext {
  context: EditorContext;
  state: ContentState;
  reader: ContentState;
  data: DocumentData;
  previousData: DocumentData;
  rawData: DocumentData;
  resolveSibling(path: string): ReturnType<typeof candidateSibling>;
}

async function writableCandidate(
  context: EditorContext,
  input: { runtime: ContentRuntime; patch: DocumentData; previousData: DocumentData },
): Promise<DocumentData> {
  const previous = editorSourceData(context, context.data ?? input.previousData);
  const normalized = await normalizeLocaleData({
    collection: context.state.collection,
    current: { [context.state.locale]: previous },
    patches: { [context.state.locale]: input.patch },
    limits: input.runtime.limits,
    applyDefaults: false,
    validateRules: false,
  });
  const rawData = normalized.dataByLocale[context.state.locale] ?? {};
  await assertWritableData({
    ...policyScope(context.selected),
    collection: context.state.collection,
    data: input.patch,
    previous,
    next: rawData,
    context: policyContext(context.selected, rawData),
  });
  return rawData;
}

async function candidateContext(
  state: ContentState,
  input: { runtime: ContentRuntime; values: EditorCandidateInput },
): Promise<EditorCandidateContext> {
  const { data: supplied, ...identity } = input.values;
  assertJsonBudget(supplied, {
    maxDepth:
      input.runtime.limits.maxFieldDepth * 2 + input.runtime.limits.maxRichTextDepth * 2 + 1,
    maxBytes: input.runtime.limits.maxDataBytes,
    maxNodes: input.runtime.limits.maxDataBytes,
  });
  const context = await editorContext(state, { runtime: input.runtime, values: identity });
  if (context.document && input.values.intent !== 'create')
    requireRevision(context.document, input.values.revision);
  const previousData = await candidateBaseline(context, input);
  const { read } = await editorLayout(context, new Set());
  const next = mergeCandidateValues({ fields: read, previous: previousData, supplied });
  const patch = snapshotPatch({ fields: read, previous: previousData, next });
  const rawData = await writableCandidate(context, { runtime: input.runtime, patch, previousData });
  const data = immutable(
    await projectData({
      ...policyScope(context.selected),
      collection: state.collection,
      data: next,
      policyData: context.data ?? rawData,
      context: policyContext(context.reader, context.data ?? rawData),
    }),
  );
  return {
    context,
    state: context.selected,
    reader: context.reader,
    data,
    previousData: immutable(previousData),
    rawData: immutable(rawData),
    resolveSibling: (path) => candidateSibling(data, path),
  };
}

async function candidateBaseline(
  context: EditorContext,
  input: { runtime: ContentRuntime; values: EditorCandidateInput },
): Promise<DocumentData> {
  if (context.document)
    return editorSourceData(
      context,
      await projectReadData(context.reader, {
        runtime: input.runtime,
        data: context.data ?? {},
        documentId: context.document.id,
      }),
    );
  if (input.values.intent === 'create' && input.values.initialSnapshot)
    return readInitialSnapshot(context.selected, input.runtime, input.values.initialSnapshot);
  return {};
}

export function withEditorCandidate<T>(
  runtime: ContentRuntime,
  input: {
    ctx: RequestContext;
    operationId: 'collections.previewEditor' | 'collections.fieldOptions';
    values: EditorCandidateInput;
  },
  work: (candidate: EditorCandidateContext) => Promise<T>,
): Promise<T> {
  return createRunner(runtime)(
    {
      ctx: input.ctx,
      operationId: input.operationId,
      collection: input.values.collection,
      mode: input.values.mode,
      ...(input.values.locale ? { locale: input.values.locale } : {}),
    },
    async (state) => work(await candidateContext(state, { runtime, values: input.values })),
  );
}

export function withEditorCandidates<T>(
  runtime: ContentRuntime,
  input: {
    ctx: RequestContext;
    operationId: 'collections.fieldOptions' | 'collections.previewEditor';
    values: readonly EditorCandidateInput[];
  },
  work: (candidates: readonly EditorCandidateContext[]) => Promise<T>,
): Promise<T> {
  const [first] = input.values;
  if (!first || input.values.length > runtime.workPolicy.maxSyncBatchItems) fail('invalid_input');
  if (
    input.values.some(
      (value) =>
        value.collection !== first.collection ||
        value.locale !== first.locale ||
        value.mode !== first.mode,
    )
  )
    fail('invalid_input');
  if (
    input.values.length > 1 &&
    (input.values.some((value) => value.intent !== 'update') ||
      new Set(input.values.map((value) => ('id' in value ? value.id : null))).size !==
        input.values.length)
  )
    fail('invalid_input');
  return createRunner(runtime)(
    {
      ctx: input.ctx,
      operationId: input.operationId,
      collection: first.collection,
      mode: first.mode,
      ...(first.locale ? { locale: first.locale } : {}),
    },
    async (state) => {
      const candidates = [];
      for (const values of input.values)
        candidates.push(await candidateContext(state, { runtime, values }));
      return work(candidates);
    },
  );
}

export type { EditorCandidateInput } from './candidate-input.ts';
