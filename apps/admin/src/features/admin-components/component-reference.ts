import { adminComponentReferenceSchema } from '../../contracts/admin-components';
import type { AdminComponentReference } from '../../contracts/admin-components';
import type { FieldData } from '../fields/types';
import { componentValue } from './component-value';

export function componentReferences(value: unknown): AdminComponentReference[] {
  if (value === undefined || value === false) return [];
  const values: readonly unknown[] = Array.isArray(value) ? value : [value];
  return values.map((entry) => adminComponentReferenceSchema.parse(entry));
}
export function componentId(reference: AdminComponentReference): string | undefined {
  if (reference === false) return undefined;
  return typeof reference === 'string' ? reference : reference.id;
}
export function componentPresentation(input: {
  reference: AdminComponentReference;
  namespace: string;
  slot: string;
  instance?: number;
  props: Readonly<Record<string, FieldData>> | undefined;
}) {
  const id = componentId(input.reference);
  if (!id) return null;
  const configured = typeof input.reference === 'object' ? input.reference.props : undefined;
  const props = componentValue(
    input.props,
    `${input.namespace}:${input.slot}:${id}${input.instance === undefined ? '' : `:${input.instance}`}`,
  );
  return {
    id,
    props: props ?? {},
    valid: props !== undefined || Object.keys(configured ?? {}).length === 0,
  };
}
