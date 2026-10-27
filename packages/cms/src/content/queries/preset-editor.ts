import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import type { z } from 'zod';
import { createRunner, policyContext } from '../runtime.ts';
import { operationState } from '../editor/context.ts';
import { editorLayout } from '../editor/layout.ts';
import { renderEditorCandidate } from '../editor/candidate-presentation.ts';
import { editorCandidateOptions } from '../editor/field-options.ts';
import { mergeCandidateValues } from '../editor/candidate-values.ts';
import { fillDefaults } from '../fields/value-defaults.ts';
import { validateDataShape } from '../fields/validate-shape.ts';
import { projectData } from '../fields/policy-read.ts';
import { assertWritableData } from '../fields/policy-write.ts';
import { candidateSibling } from '../fields/sibling-data.ts';
import { policyScope, functionScope } from '../hooks/invoke.ts';
import { snapshotPatch } from '../documents/snapshot-patch.ts';
import { presetInitialData, presetInitialSnapshot } from './preset-initial-data.ts';
import {
  assertPresetOperation,
  lockedPreset,
  requirePresetVersion,
  presetSnapshot,
} from './preset-records.ts';
import { presetConstraintChoices } from './preset-choices.ts';
import { editorComponentVersions } from '../editor/component-versions.ts';
import { parse } from '../runtime.ts';
import { queryPresetQuerySchema } from './preset-contracts.ts';
import { presetAllowed } from './preset-access.ts';
import { parsePresetInput } from './preset-parse.ts';
import { presetEditorSchema } from './preset-contracts.ts';
import type { queryPresetInputSchemas } from './preset-contracts.ts';
import type { EditorCandidateContext } from '../editor/candidate-context.ts';
import type { EditorContext } from '../editor/context.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentData } from '../definition.ts';

export type PresetCandidateInput = z.infer<
  ReturnType<typeof queryPresetInputSchemas>['queryPresets.preview']
>;
type OptionsInput = z.infer<
  ReturnType<typeof queryPresetInputSchemas>['queryPresets.fieldOptions']
>;

async function candidateAuthority(
  state: ContentState,
  runtime: ContentRuntime,
  input: PresetCandidateInput,
) {
  assertPresetOperation(state);
  const writer = await operationState(state, {
    runtime,
    operationId: input.id ? 'queryPresets.share' : 'queryPresets.create',
    mode: 'editing',
  });
  assertPresetOperation(writer);
  if (!input.id) return { writer, previous: undefined };
  const previous = await lockedPreset(writer, runtime, { id: input.id, action: 'read' });
  if (
    !(await presetAllowed(writer, runtime, { preset: presetSnapshot(previous), action: 'update' }))
  )
    fail('not_found');
  requirePresetVersion(previous, input.version ?? 0);
  return { writer, previous: previous.access[input.action] };
}

function candidateContext(
  state: ContentState,
  runtime: ContentRuntime,
  data: DocumentData,
): EditorContext {
  return {
    state,
    reader: state,
    selected: state,
    registry: runtime.registry,
    data,
    document: null,
    versionId: null,
    fallback: [],
    input: {
      collection: state.collection.key,
      locale: state.locale,
      intent: 'create',
      mode: 'editing',
    },
    relations: new Map(),
    requirements: new Map(),
  };
}

async function candidateValues(
  source: ContentState,
  runtime: ContentRuntime,
  input: { previousData: DocumentData; merged: DocumentData },
) {
  const { previousData, merged } = input;
  await assertWritableData({
    ...policyScope(source),
    collection: source.collection,
    data: snapshotPatch({ fields: source.collection.fields, previous: previousData, next: merged }),
    previous: previousData,
    next: merged,
    context: policyContext(source, merged),
  });
  const rawData = validateDataShape({
    collection: source.collection,
    data: await fillDefaults({
      fields: source.collection.fields,
      data: merged,
      locale: source.locale,
      limits: runtime.limits,
      scope: functionScope(source),
    }),
    locale: source.locale,
    mode: 'draft',
    limits: runtime.limits,
    applyDefaults: false,
  });
  return rawData;
}

interface SettingsInput {
  input: PresetCandidateInput;
  authority?: Awaited<ReturnType<typeof candidateAuthority>>;
}

async function settingsSource(
  state: ContentState,
  runtime: ContentRuntime,
  request: SettingsInput,
) {
  const { input, authority } = request;
  const { writer, previous } = authority ?? (await candidateAuthority(state, runtime, input));
  const rule = input.access[input.action];
  const registered = state.collection.queryPresetConstraints?.[input.action]?.find(
    (option) => option.value === rule.constraint,
  );
  if (!registered) fail('invalid_input');
  const source = {
    ...writer,
    collection: { ...state.collection, fields: registered.fields ?? [] },
  };
  const signed = rule.initialSnapshot
    ? presetInitialData(writer, runtime, {
        action: input.action,
        constraint: rule.constraint,
        token: rule.initialSnapshot,
        id: input.id,
      })
    : {};
  const previousData = previous?.constraint === rule.constraint ? (previous.data ?? {}) : signed;
  const merged = mergeCandidateValues({
    fields: source.collection.fields,
    previous: previousData,
    supplied: rule.data ?? {},
  });
  return { writer, previous, rule, source, previousData, merged };
}

async function settingsCandidate(
  state: ContentState,
  runtime: ContentRuntime,
  request: SettingsInput,
) {
  const { input } = request;
  const { writer, previous, rule, source, previousData, merged } = await settingsSource(
    state,
    runtime,
    request,
  );
  const rawData = await candidateValues(source, runtime, { previousData, merged });
  const data = await projectData({
    ...policyScope(source),
    collection: source.collection,
    data: rawData,
    context: policyContext(source, rawData),
  });
  const context = candidateContext(source, runtime, rawData);
  const candidate: EditorCandidateContext = {
    context,
    state: source,
    reader: source,
    data,
    previousData,
    rawData,
    resolveSibling: (path) => candidateSibling(data, path),
  };
  return {
    candidate,
    initialSnapshot:
      previous?.constraint === rule.constraint
        ? null
        : (rule.initialSnapshot ??
          presetInitialSnapshot(writer, runtime, {
            action: input.action,
            constraint: rule.constraint,
            data,
            id: input.id,
          })),
  };
}

async function describe(state: ContentState, runtime: ContentRuntime, input: PresetCandidateInput) {
  const authority = await candidateAuthority(state, runtime, input);
  const constraints = await presetConstraintChoices(authority.writer, input.action, {
    ...(input.id ? { id: input.id } : {}),
    ownerId: state.actor.id,
    name: input.name,
    query: parse(queryPresetQuerySchema, input.query),
    access: input.access,
  });
  if (!constraints.some((choice) => choice.value === input.access[input.action].constraint))
    fail('forbidden');
  if (['everyone', 'onlyMe', 'specificUsers'].includes(input.access[input.action].constraint)) {
    return {
      behaviorHash: runtime.registry.behaviorHash,
      layout: [],
      data: {},
      initialSnapshot: null,
      constraints,
      componentVersions: {},
      richTextNodes: [],
      visibility: {},
    };
  }
  const { candidate, initialSnapshot } = await settingsCandidate(state, runtime, {
    input,
    authority,
  });
  const projection = await editorLayout(candidate.context, new Set());
  return presetEditorSchema.parse({
    ...(await renderEditorCandidate(runtime, candidate)),
    layout: projection.layout,
    data: candidate.data,
    initialSnapshot,
    constraints,
    componentVersions: editorComponentVersions(
      runtime,
      candidate.state.collection,
      projection.layout,
    ),
    richTextNodes: (state.collection.richTextNodes ?? []).map(({ type, version }) => ({
      type,
      version,
    })),
  });
}

async function options(state: ContentState, runtime: ContentRuntime, input: OptionsInput) {
  const authority = await candidateAuthority(state, runtime, input);
  const choices = await presetConstraintChoices(authority.writer, input.action, {
    ...(input.id ? { id: input.id } : {}),
    ownerId: state.actor.id,
    name: input.name,
    query: parse(queryPresetQuerySchema, input.query),
    access: input.access,
  });
  if (!choices.some((choice) => choice.value === input.access[input.action].constraint))
    fail('forbidden');
  const { candidate } = await settingsCandidate(state, runtime, { input, authority });
  return editorCandidateOptions(runtime, [candidate], {
    collection: input.collection,
    path: input.path,
    relationTo: input.relationTo,
    page: input.page,
    pageSize: input.pageSize,
    ...(input.q ? { q: input.q } : {}),
    ...(input.targetId ? { id: input.targetId } : {}),
  });
}

export function createPresetEditorApi(runtime: ContentRuntime) {
  return {
    previewQueryPreset: (ctx: RequestContext, raw: unknown) => {
      const input = parsePresetInput(runtime, runtime.schemas['queryPresets.preview'], raw);
      return createRunner(runtime)(
        {
          ctx,
          operationId: 'queryPresets.preview',
          collection: input.collection,
          ...(input.locale ? { locale: input.locale } : {}),
        },
        (state) => describe(state, runtime, input),
      );
    },
    queryPresetFieldOptions: (ctx: RequestContext, raw: unknown) => {
      const input = parsePresetInput(runtime, runtime.schemas['queryPresets.fieldOptions'], raw);
      return createRunner(runtime)(
        {
          ctx,
          operationId: 'queryPresets.fieldOptions',
          collection: input.collection,
          ...(input.locale ? { locale: input.locale } : {}),
        },
        (state) => options(state, runtime, input),
      );
    },
  };
}
