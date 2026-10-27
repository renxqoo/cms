import { valueAtPath } from '../documents/data-path.ts';
import type { DocumentView } from '../model.ts';
import { dataFieldInstances, fieldPaths } from '../fields/structure.ts';
import { isFieldReadable } from '../fields/policy-read.ts';
import { policyContext } from '../runtime.ts';
import { policyScope } from '../hooks/invoke.ts';
import { adminAreas } from '../collections/admin-areas.ts';
import { componentBindings } from './component-bindings.ts';
import { resolveComponentProps } from './component-props.ts';
import type { ComponentBinding } from './component-bindings.ts';
import type { DocumentData, FieldDefinition } from '../definition.ts';
import type { ContentRuntime, ContentState } from '../types.ts';

export async function documentComponentProps(
  state: ContentState,
  input: { runtime: ContentRuntime; data: DocumentData; documentId: string; joinsOnly?: boolean },
) {
  if (input.joinsOnly && !state.readPolicyData?.has(input.data)) return {};
  const fields = fieldPaths(state.collection.fields, '', { includeUi: true });
  const paths = new Map(fields.map((entry) => [entry.field.id, entry.path]));
  const instances = dataFieldInstances({
    fields: state.collection.fields,
    data: input.data,
    includeUi: true,
  });
  const visited = new Set<string>();
  const bindings: ComponentBinding[] = [];
  const original = state.readPolicyData?.get(input.data) ?? input.data;
  for (const { field, path } of instances) {
    if ((field.type === 'join') !== (input.joinsOnly === true)) continue;
    if (field.type === 'join' && valueAtPath(input.data, path) === undefined) continue;
    const namespace = `${paths.get(field.id) ?? path}#${field.id}`;
    const configured = configuredBindings(field, namespace);
    if (configured.length === 0) continue;
    if (
      visited.has(namespace) ||
      !(await isFieldReadable(
        field,
        { ...policyContext(state, original), path, documentId: input.documentId },
        policyScope(state),
      ))
    )
      continue;
    visited.add(namespace);
    bindings.push(...configured.map((binding) => ({ ...binding, path })));
  }
  if (bindings.length === 0) return {};
  return { componentProps: await resolveComponentProps(state, { ...input, bindings }) };
}

export async function attachJoinedComponentProps(
  state: ContentState,
  input: { runtime: ContentRuntime; views: readonly DocumentView[] },
): Promise<void> {
  for (const view of input.views) {
    const presentation = await documentComponentProps(state, {
      runtime: input.runtime,
      data: view.data,
      documentId: view.id,
      joinsOnly: true,
    });
    if (presentation.componentProps)
      view.componentProps = { ...view.componentProps, ...presentation.componentProps };
  }
}

function configuredBindings(field: FieldDefinition, namespace: string): ComponentBinding[] {
  const disabled = adminAreas(field);
  return componentBindings(namespace, field.admin?.components).filter(
    (binding) =>
      binding.reference !== false &&
      ((binding.slot === 'Cell' && !disabled.column) || binding.slot === 'Diff'),
  );
}
