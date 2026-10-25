import { ruleResult } from '../fields/rule-result.ts';
import { policyContext } from '../runtime.ts';
import { projectDefault } from './defaults.ts';
import type {
  FieldDefinition,
  FieldPolicyContext,
  BlockDefinition,
  TabDefinition,
} from '../definition.ts';
import type { EditorAccess, EditorNode } from './contracts.ts';
import type { EditorContext } from './context.ts';

interface LayoutInput {
  context: FieldPolicyContext;
  write: EditorAccess;
  path: string;
}
interface Projection {
  layout: EditorNode[];
  read: FieldDefinition[];
  write: FieldDefinition[];
}

function writeAccess(field: FieldDefinition, inherited: EditorAccess): EditorAccess {
  if (inherited === 'denied' || field.type === 'join') return 'denied';
  return inherited === 'conditional' || field.access?.write ? 'conditional' : 'allowed';
}

function constraints(field: FieldDefinition): EditorNode['constraints'] {
  return {
    ...(field.min === undefined ? {} : { min: field.min }),
    ...(field.max === undefined ? {} : { max: field.max }),
    ...(field.minLength === undefined ? {} : { minLength: field.minLength }),
    ...(field.maxLength === undefined ? {} : { maxLength: field.maxLength }),
    ...(field.precision === undefined ? {} : { precision: field.precision }),
    ...(field.options ? { options: [...field.options] } : {}),
    ...(field.hasMany === undefined ? {} : { hasMany: field.hasMany }),
    ...(field.relationTo ? { relationTo: [...field.relationTo] } : {}),
    ...(field.defaultValue === undefined
      ? {}
      : { defaultValue: projectDefault(field, field.defaultValue) }),
  };
}

function childPath(name: string | undefined, prefix: string): string {
  if (name === undefined) return prefix;
  return prefix ? `${prefix}.${name}` : name;
}

interface NestedProjection {
  children: Projection;
  blocks: { block: BlockDefinition; projection: Projection }[];
  tabs: { tab: TabDefinition; projection: Projection }[];
}

function nestedProjection(field: FieldDefinition, input: LayoutInput): NestedProjection {
  return {
    children: projectFields(field.fields ?? [], input),
    blocks: (field.blocks ?? []).map((block) => ({
      block,
      projection: projectFields(block.fields, input),
    })),
    tabs: (field.tabs ?? []).map((tab) => ({
      tab,
      projection: projectFields(tab.fields, { ...input, path: childPath(tab.name, input.path) }),
    })),
  };
}

function projectedDefinition(
  field: FieldDefinition,
  nested: NestedProjection,
  view: 'read' | 'write',
): FieldDefinition {
  return {
    ...field,
    ...(field.fields ? { fields: nested.children[view] } : {}),
    ...(field.blocks
      ? {
          blocks: nested.blocks.map(({ block, projection }) => ({
            ...block,
            fields: projection[view],
          })),
        }
      : {}),
    ...(field.tabs
      ? {
          tabs: nested.tabs
            .filter(({ projection }) => projection[view].length > 0)
            .map(({ tab, projection }) => ({ ...tab, fields: projection[view] })),
        }
      : {}),
  };
}

function childLayouts(field: FieldDefinition, nested: NestedProjection) {
  return {
    ...(field.fields ? { children: nested.children.layout } : {}),
    ...(field.blocks
      ? {
          blocks: nested.blocks.map(({ block, projection }) => ({
            id: block.id,
            key: block.key,
            label: block.label,
            children: projection.layout,
          })),
        }
      : {}),
    ...(field.tabs
      ? {
          tabs: nested.tabs
            .filter(({ projection }) => projection.layout.length > 0)
            .map(({ tab, projection }) => ({
              id: tab.id,
              ...(tab.name ? { name: tab.name } : {}),
              label: tab.label,
              children: projection.layout,
            })),
        }
      : {}),
  };
}

function fieldProjection(field: FieldDefinition, input: LayoutInput) {
  const write = writeAccess(field, input.write);
  const path = childPath(field.name, input.path);
  const nested = nestedProjection(field, { ...input, write, path });
  const read = projectedDefinition(field, nested, 'read');
  const node: EditorNode = {
    id: field.id,
    type: field.type,
    label: field.label ?? field.name ?? '',
    ...(field.name ? { name: field.name, path } : {}),
    required: field.required === true,
    localized: field.localized === true,
    write,
    constraints: constraints(read),
    ...childLayouts(field, nested),
  };
  return { read, writable: projectedDefinition(field, nested, 'write'), node };
}

function emptyDisplay(node: EditorNode): boolean {
  return (
    (['row', 'collapsible'].includes(node.type) && node.children?.length === 0) ||
    (node.type === 'tabs' && node.tabs?.length === 0)
  );
}

function projectFields(fields: readonly FieldDefinition[], input: LayoutInput): Projection {
  const result: Projection = { layout: [], read: [], write: [] };
  for (const field of fields) {
    if (field.access?.read && !ruleResult(field.access.read.run(input.context))) continue;
    const { read, writable, node } = fieldProjection(field, input);
    if (emptyDisplay(node)) continue;
    result.layout.push(node);
    result.read.push(read);
    if (node.write !== 'denied') result.write.push(writable);
  }
  return result;
}

function annotateQueries(nodes: EditorNode[], queryable: ReadonlySet<string>): void {
  for (const node of nodes) {
    if (node.path !== undefined) node.queryable = queryable.has(node.path);
    annotateQueries(node.children ?? [], queryable);
    for (const block of node.blocks ?? []) annotateQueries(block.children, queryable);
    for (const tab of node.tabs ?? []) annotateQueries(tab.children, queryable);
  }
}

export function editorLayout(context: EditorContext, queryable: ReadonlySet<string>): Projection {
  const readable = policyContext(context.reader, context.data);
  let write: EditorAccess = 'allowed';
  if (context.input.intent === 'read') write = 'denied';
  else if (
    context.selected.predicate ||
    (context.input.intent === 'copy' && context.state.collection.access?.['documents.create'])
  )
    write = 'conditional';
  const result = projectFields(context.state.collection.fields, {
    context: readable,
    write,
    path: '',
  });
  annotateQueries(result.layout, queryable);
  return result;
}
