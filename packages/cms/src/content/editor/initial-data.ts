import { policyScope } from '../hooks/invoke.ts';
import { fillDefaults } from '../fields/value-defaults.ts';
import { validateDataShape } from '../fields/validate-shape.ts';
import { projectData } from '../fields/policy-read.ts';
import { functionScope } from '../hooks/invoke.ts';
import { policyContext } from '../runtime.ts';
import type { ContentRuntime } from '../types.ts';
import type { DocumentData, FieldDefinition } from '../definition.ts';
import type { EditorContext } from './context.ts';

export async function editorInitialData(
  context: EditorContext,
  input: { runtime: ContentRuntime; fields: readonly FieldDefinition[] },
): Promise<DocumentData | null> {
  if (context.input.intent !== 'create') return null;
  const state = context.selected;
  const collection = { ...state.collection, fields: input.fields };
  const defaults = await fillDefaults({
    fields: input.fields,
    data: {},
    locale: state.locale,
    limits: input.runtime.limits,
    scope: functionScope(state),
  });
  const safe = await projectData({
    ...policyScope(state),
    collection,
    data: defaults,
    context: policyContext(context.reader, defaults),
  });
  const data = validateDataShape({
    collection,
    data: safe,
    locale: state.locale,
    mode: 'draft',
    limits: input.runtime.limits,
    applyDefaults: false,
  });
  return await projectData({
    ...policyScope(state),
    collection,
    data,
    policyData: defaults,
    context: policyContext(context.reader, defaults),
  });
}
