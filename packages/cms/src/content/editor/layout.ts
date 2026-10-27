import { fieldPresentation } from './field-presentation.ts';
import { adminAreas } from '../collections/admin-areas.ts';
import { resolveLabel } from '../collections/labels.ts';
import { collectionTypeConstraint } from '../hierarchy/collection-scope.ts';
import { fieldComponentsSchema } from '../collections/admin-components.ts';
import { isFieldReadable } from '../fields/policy-read.ts';
import { policyScope } from '../hooks/invoke.ts';
import type { PolicyScope } from '../fields/policy-context.ts';
import { dynamicDefault } from '../fields/value-defaults.ts';
import { policyContext } from '../runtime.ts';
import { joinCollections } from '../joins/config.ts';
import { projectDefault } from './defaults.ts';
import type {
  FieldDefinition,
  FieldPolicyContext,
  BlockDefinition,
  TabDefinition,
} from '../definition.ts';
import type { EditorAccess, EditorNode } from './contracts.ts';
import type { EditorContext } from './context.ts';

interface LayoutInput extends PolicyScope {
  filteredTargets: ReadonlySet<string>;
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
  if (inherited === 'denied' || ['join', 'ui'].includes(field.type) || field.virtual)
    return 'denied';
  return inherited === 'conditional' || field.access?.write ? 'conditional' : 'allowed';
}

function constraints(field: FieldDefinition, input: LayoutInput): EditorNode['constraints'] {
  return {
    ...nativeConstraints(field),
    ...(field.min === undefined ? {} : { min: field.min }),
    ...(field.max === undefined ? {} : { max: field.max }),
    ...(field.minLength === undefined ? {} : { minLength: field.minLength }),
    ...(field.maxLength === undefined ? {} : { maxLength: field.maxLength }),
    ...(field.minRows === undefined ? {} : { minRows: field.minRows }),
    ...relationshipConstraints(field, input),
    ...(field.join
      ? {
          join: {
            collections: [...joinCollections(field.join)],
            orderable: field.join.orderable === true,
            defaultPageSize: field.join.defaultPageSize ?? input.limits.defaultPageSize,
            maxPageSize: input.limits.maxPageSize,
          },
        }
      : {}),
    ...(field.maxRows === undefined ? {} : { maxRows: field.maxRows }),
    ...(field.precision === undefined ? {} : { precision: field.precision }),
    ...(field.options ? { options: [...field.options] } : {}),
    ...(field.hasMany === undefined ? {} : { hasMany: field.hasMany }),
    ...(field.relationTo ? { relationTo: [...field.relationTo] } : {}),
    ...(field.defaultValue === undefined || dynamicDefault(field.defaultValue)
      ? {}
      : { defaultValue: projectDefault(field, field.defaultValue) }),
  };
}

function relationshipConstraints(
  field: FieldDefinition,
  input: LayoutInput,
): EditorNode['constraints'] {
  return {
    ...(field.maxDepth === undefined ? {} : { maxDepth: field.maxDepth }),
    ...(field.filterOptions !== undefined ||
    field.relationTo?.some((target) => input.filteredTargets.has(target))
      ? { filterOptions: true }
      : {}),
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

async function nestedProjection(
  field: FieldDefinition,
  input: LayoutInput,
): Promise<NestedProjection> {
  return {
    children: await projectFields(field.fields ?? [], input),
    blocks: await Promise.all(
      (field.blocks ?? []).map(async (block) => ({
        block,
        projection: await projectFields(block.fields, input),
      })),
    ),
    tabs: await Promise.all(
      (field.tabs ?? []).map(async (tab) => ({
        tab,
        projection: await projectFields(tab.fields, {
          ...input,
          path: childPath(tab.name, input.path),
        }),
      })),
    ),
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

function childLayouts(field: FieldDefinition, nested: NestedProjection, locale: string) {
  return {
    ...(field.fields ? { children: nested.children.layout } : {}),
    ...(field.blocks
      ? {
          blocks: nested.blocks.map(({ block, projection }) => ({
            id: block.id,
            key: block.key,
            label: resolveLabel(block.label, locale, block.key),
            ...(block.admin?.components ? { components: block.admin.components } : {}),
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
              label: resolveLabel(tab.label, locale, tab.name ?? tab.id),
              children: projection.layout,
            })),
        }
      : {}),
  };
}

async function fieldProjection(field: FieldDefinition, input: LayoutInput) {
  const write = writeAccess(field, input.write);
  const path = childPath(field.name, input.path);
  const nested = await nestedProjection(field, { ...input, write, path });
  const read = projectedDefinition(field, nested, 'read');
  const node: EditorNode = {
    id: field.id,
    type: field.type,
    label: resolveLabel(field.label, input.context.locale, field.name ?? ''),
    ...(field.name ? { name: field.name, path } : {}),
    ...fieldPresentation(field, input.context.locale),
    required: field.required === true,
    localized: field.localized === true,
    disabled: adminAreas(field),
    write,
    constraints: constraints(read, input),
    ...(field.admin?.condition ? { condition: true } : {}),
    ...(field.admin?.components
      ? { components: fieldComponentsSchema.parse(field.admin.components) }
      : {}),
    ...childLayouts(field, nested, input.context.locale),
  };
  return { read, writable: projectedDefinition(field, nested, 'write'), node };
}

function emptyDisplay(node: EditorNode): boolean {
  return (
    (['row', 'collapsible'].includes(node.type) && node.children?.length === 0) ||
    (node.type === 'tabs' && node.tabs?.length === 0)
  );
}

async function projectFields(
  fields: readonly FieldDefinition[],
  input: LayoutInput,
): Promise<Projection> {
  const result: Projection = { layout: [], read: [], write: [] };
  for (const field of fields) {
    if (
      !(await isFieldReadable(
        field,
        { ...input.context, path: childPath(field.name, input.path) },
        input,
      ))
    )
      continue;
    const { read, writable, node } = await fieldProjection(field, input);
    if (emptyDisplay(node)) continue;
    result.layout.push(node);
    if (field.type !== 'ui') result.read.push(read);
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

export async function editorLayout(
  context: EditorContext,
  queryable: ReadonlySet<string>,
): Promise<Projection> {
  const readable = {
    ...policyContext(context.reader, context.data),
    ...(context.document ? { documentId: context.document.id } : {}),
  };
  let write: EditorAccess = 'allowed';
  if (context.input.intent === 'read') write = 'denied';
  else if (
    context.selected.predicate ||
    (context.input.intent === 'copy' && context.state.collection.access?.['documents.create'])
  )
    write = 'conditional';
  const result = await projectFields(context.state.collection.fields, {
    ...policyScope(context.state),
    context: readable,
    filteredTargets: new Set(
      context.registry.list
        .filter((target) => collectionTypeConstraint(target, context.state.collection.key))
        .map((target) => target.key),
    ),
    write,
    path: '',
  });
  annotateQueries(result.layout, queryable);
  return result;
}

function nativeConstraints(field: FieldDefinition): EditorNode['constraints'] {
  return {
    ...(field.type === 'date' && field.timezone ? { timezone: `${field.name}_tz` } : {}),
    ...(field.useAsSlug ? { useAsSlug: field.useAsSlug } : {}),
  };
}
