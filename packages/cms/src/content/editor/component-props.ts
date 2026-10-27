import { fail } from '@new-cms/cms/platform/contracts';
import { componentId } from '../collections/admin-component-reference.ts';
import { assertJsonBudget } from '../fields/data-budget.ts';
import { objectValue, isJsonValue } from '../fields/json-value.ts';
import { candidateSibling } from '../fields/sibling-data.ts';
import { hookContext, invoke, immutable } from '../hooks/invoke.ts';
import { bindingKey } from './component-bindings.ts';
import type { ComponentBinding } from './component-bindings.ts';
import type { AdminComponentContext } from '../collections/admin-types.ts';
import type { DocumentData } from '../definition.ts';
import type { ContentRuntime, ContentState } from '../types.ts';

function checkedProps(value: unknown, runtime: ContentRuntime): DocumentData {
  assertJsonBudget(value, {
    maxDepth: runtime.limits.maxFieldDepth,
    maxNodes: runtime.limits.maxDataBytes,
    maxBytes: runtime.limits.maxDataBytes,
  });
  if (!objectValue(value) || !isJsonValue(value)) fail('invalid_input');
  return immutable(value);
}
async function resolveProps(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    binding: ComponentBinding;
    data: DocumentData;
    documentId?: string;
  },
): Promise<DocumentData> {
  const { binding, runtime } = input;
  const id = componentId(binding.reference);
  if (!id) return {};
  const registration = runtime.registry.adminComponents.find((entry) => entry.id === id);
  if (!registration || !registration.slots.includes(binding.slot)) fail('invalid_input');
  const props = checkedProps(
    typeof binding.reference === 'object' ? (binding.reference.props ?? {}) : {},
    runtime,
  );
  const related = binding.path
    ? candidateSibling(input.data, binding.path, binding.rowContext ? { self: true } : {})
    : { siblingData: input.data, blockData: undefined };
  const context: AdminComponentContext = Object.freeze({
    ...hookContext(state, {
      data: input.data,
      ...(binding.path ? { path: binding.path } : {}),
      ...(input.documentId ? { documentId: input.documentId } : {}),
    }),
    data: immutable(input.data),
    siblingData: immutable(related.siblingData),
    ...(related.blockData ? { blockData: immutable(related.blockData) } : {}),
    componentId: id,
    slot: binding.slot,
    props,
  });
  const resolved = registration.resolveProps
    ? await invoke(state, { hook: registration.resolveProps, context, limits: runtime.limits })
    : {};
  const finalProps = checkedProps({ ...props, ...checkedProps(resolved, runtime) }, runtime);
  if (registration.validateProps) {
    const allowed = await invoke(state, {
      hook: registration.validateProps,
      context: Object.freeze({ ...context, props: finalProps }),
      limits: runtime.limits,
    });
    if (allowed !== true) fail('invalid_input');
  } else if (Object.keys(finalProps).length > 0) fail('invalid_input');
  return finalProps;
}
export async function resolveComponentProps(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    bindings: readonly ComponentBinding[];
    data: DocumentData;
    documentId?: string;
  },
): Promise<Record<string, DocumentData>> {
  const result: Record<string, DocumentData> = {};
  for (const binding of input.bindings) {
    const key = bindingKey(binding);
    if (!key) continue;
    result[key] = await resolveProps(state, { ...input, binding });
  }
  return result;
}
