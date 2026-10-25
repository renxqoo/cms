import { fail } from '@new-cms/cms/platform/contracts';
import type { CollectionDefinition, FieldDefinition } from '../definition.ts';
import { dataFields } from './structure.ts';
interface FieldChain {
  field: FieldDefinition;
  chain: readonly FieldDefinition[];
}
function chains(
  fields: readonly FieldDefinition[],
  parents: readonly FieldDefinition[] = [],
): FieldChain[] {
  return dataFields(fields).flatMap((field) => {
    const chain = [...parents, field];
    const children =
      field.type === 'blocks'
        ? (field.blocks ?? []).flatMap((block) => block.fields)
        : (field.fields ?? []);
    return [{ field, chain }, ...chains(children, chain)];
  });
}
function matchPath(
  chain: readonly FieldDefinition[],
  segments: readonly string[],
): { position: number; items: ReadonlyMap<string, string> } | undefined {
  let position = 0;
  const items = new Map<string, string>();
  for (const [index, field] of chain.entries()) {
    if (segments[position] !== field.name) return undefined;
    position += 1;
    if (index < chain.length - 1 && ['array', 'blocks'].includes(field.type)) {
      const item = segments[position];
      if (
        !item ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item)
      )
        return undefined;
      items.set(field.id, item);
      position += 1;
    }
  }
  return { position, items };
}
export function remapReferencePath(input: {
  from: CollectionDefinition;
  to: CollectionDefinition;
  path: string;
  fieldId?: string;
}): string {
  if (input.from.id !== input.to.id) fail('invalid_input');
  const segments = input.path.split('.');
  const candidates = chains(input.from.fields)
    .filter((entry) => input.fieldId === undefined || entry.field.id === input.fieldId)
    .map((entry) => ({ ...entry, match: matchPath(entry.chain, segments) }))
    .filter((entry) => entry.match !== undefined)
    .toSorted((a, b) => (b.match?.position ?? 0) - (a.match?.position ?? 0));
  const [source] = candidates;
  if (!source?.match) fail('invalid_input');
  const target = chains(input.to.fields).find((entry) => entry.field.id === source.field.id);
  if (!target) fail('invalid_input');
  const result: string[] = [];
  for (const [index, field] of target.chain.entries()) {
    result.push(String(field.name));
    if (index < target.chain.length - 1 && ['array', 'blocks'].includes(field.type)) {
      const item = source.match.items.get(field.id);
      if (!item) fail('invalid_input');
      result.push(item);
    }
  }
  return [...result, ...segments.slice(source.match.position)].join('.');
}
