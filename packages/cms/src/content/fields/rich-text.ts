import { validateRegisteredNode, registeredNodeReferences } from './rich-text-nodes.ts';
import { richTextNodeSchemas } from './rich-text-schema.ts';
import { assertJsonBudget } from './data-budget.ts';
import { objectValue } from './json-value.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import type {
  ContentLimits,
  DocumentData,
  JsonValue,
  ReferenceValue,
  RichTextNodeRegistration,
} from '../definition.ts';

function keys(value: DocumentData, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail('invalid_input');
}
function safeLink(value: JsonValue | undefined): void {
  if (typeof value !== 'string') fail('invalid_input');
  if (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !Array.from(value).some((character) => character.charCodeAt(0) <= 32)
  )
    return;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail('invalid_input');
  }
  if (
    !['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol) ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32)
  )
    fail('invalid_input');
}
function validateContainer(value: DocumentData, type: string): void {
  if (type === 'link') {
    keys(value, ['type', 'url', 'reference', 'children']);
    const { reference } = value;
    if (reference !== undefined) {
      if (value['url'] !== undefined || !objectValue(reference)) fail('invalid_input');
      keys(reference, ['collection', 'id']);
      validateReferenceNode({ type: 'relationship', ...reference });
    } else safeLink(value['url']);
  } else if (
    !Object.hasOwn(richTextNodeSchemas, type) ||
    !richTextNodeSchemas[type]?.safeParse(value).success
  )
    fail('invalid_input');
}
function scalarNode(value: DocumentData, type: string): boolean {
  if (type !== 'text' && type !== 'horizontalRule') return false;
  if (!richTextNodeSchemas[type]?.safeParse(value).success) fail('invalid_input');
  return true;
}
function node(
  value: JsonValue,
  state: {
    count: number;
    depth: number;
    limits: ContentLimits;
    registrations: readonly RichTextNodeRegistration[];
  },
): void {
  if (!objectValue(value) || typeof value['type'] !== 'string') fail('invalid_input');
  state.count += 1;
  if (state.count > state.limits.maxRichTextNodes || state.depth > state.limits.maxRichTextDepth)
    fail('payload_too_large');
  const { type } = value;
  if (scalarNode(value, type)) return;
  if (type === 'relationship' || type === 'media') {
    validateReferenceNode(value);
    return;
  }
  if (
    validateRegisteredNode({
      node: value,
      registrations: state.registrations,
      limits: state.limits,
    })
  )
    return;
  validateContainer(value, type);
  const nodes = value['children'];
  if (!Array.isArray(nodes)) fail('invalid_input');
  for (const child of nodes) node(child, { ...state, depth: state.depth + 1 });
}
function assertNodeBudget(nodes: readonly JsonValue[], limits: ContentLimits): void {
  if (nodes.length > limits.maxRichTextNodes) fail('payload_too_large');
  const stack = nodes.map((value) => ({ value, depth: 1 }));
  let count = 0;
  while (stack.length > 0) {
    const entry = stack.pop();
    if (!entry) break;
    count += 1;
    if (count > limits.maxRichTextNodes || entry.depth > limits.maxRichTextDepth)
      fail('payload_too_large');
    if (!objectValue(entry.value)) continue;
    const { children } = entry.value;
    if (Array.isArray(children)) {
      if (count + stack.length + children.length > limits.maxRichTextNodes)
        fail('payload_too_large');
      for (const child of children) stack.push({ value: child, depth: entry.depth + 1 });
    }
  }
}

export function validateRichText(
  value: JsonValue,
  limits: ContentLimits,
  registrations: readonly RichTextNodeRegistration[] = [],
): JsonValue {
  assertJsonBudget(value, {
    maxDepth: limits.maxRichTextDepth * 2 + 2,
    maxNodes: limits.maxDataBytes,
    maxBytes: limits.maxDataBytes,
  });
  if (!objectValue(value) || value['version'] !== 1 || !Array.isArray(value['children']))
    fail('invalid_input');
  keys(value, ['version', 'children']);
  assertNodeBudget(value['children'], limits);
  for (const child of value['children']) node(child, { count: 0, depth: 1, limits, registrations });
  return structuredClone(value);
}
export function richTextReferences(input: {
  value: JsonValue;
  path: string;
  fieldId: string;
  limits: ContentLimits;
  registrations?: readonly RichTextNodeRegistration[];
}): ReferenceValue[] {
  if (!objectValue(input.value)) return [];
  const result: ReferenceValue[] = registeredNodeReferences({
    node: input.value,
    registrations: input.registrations ?? [],
    limits: input.limits,
    path: input.path,
    fieldId: input.fieldId,
  });
  result.push(...builtinReferences(input.value, input.path, input.fieldId));
  const nodes = input.value['children'];
  if (Array.isArray(nodes))
    for (const [index, child] of nodes.entries())
      result.push(
        ...richTextReferences({ ...input, value: child, path: `${input.path}.children.${index}` }),
      );
  return result;
}

function validateReferenceNode(value: DocumentData): void {
  keys(value, ['type', 'collection', 'id']);
  const { id } = value;
  if (typeof value['collection'] !== 'string' || typeof id !== 'string') fail('invalid_input');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    fail('invalid_input');
}

function builtinReferences(
  candidate: DocumentData,
  path: string,
  fieldId: string,
): ReferenceValue[] {
  const { type } = candidate;
  const reference = type === 'link' ? candidate['reference'] : candidate;
  if (
    typeof type !== 'string' ||
    !['link', 'relationship', 'media'].includes(type) ||
    !objectValue(reference) ||
    typeof reference['collection'] !== 'string' ||
    typeof reference['id'] !== 'string'
  )
    return [];
  return [
    {
      collection: reference['collection'],
      id: reference['id'].toLowerCase(),
      path: type === 'link' ? `${path}.reference` : path,
      fieldId,
      onDelete: 'restrict',
      media: type === 'media',
    },
  ];
}
