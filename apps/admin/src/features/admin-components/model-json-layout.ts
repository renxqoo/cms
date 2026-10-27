import type { EditorNode } from '../../contracts/editor';
import { isFieldData } from '../fields/data';
import type { FieldData, JsonValue } from '../fields/types';
import type { FieldComponentProps } from './types';

export function jsonLayout(props: FieldComponentProps, zh: boolean): EditorNode[] {
  if (props.customProps?.['kind'] === 'provenance') return provenanceLayout(zh);
  if (props.customProps?.['kind'] === 'strings')
    return [
      modelNode('items', props.node.label, {
        constraints: {
          hasMany: true,
          ...(props.node.name === 'supports'
            ? { maxRows: 100, maxLength: 2000, minLength: 1 }
            : {}),
        },
      }),
    ];
  const schema = props.customProps?.['schema'];
  if (typeof schema !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(schema);
    return schemaLayout(isFieldData(parsed) ? parsed : undefined);
  } catch {
    return [];
  }
}

export function modelNode(
  name: string,
  label: string,
  extra: Partial<EditorNode> = {},
): EditorNode {
  return {
    id: name,
    name,
    label,
    type: 'text',
    required: false,
    localized: false,
    write: 'allowed',
    constraints: {},
    ...extra,
  };
}

export function provenanceLayout(zh: boolean): EditorNode[] {
  return [
    modelNode('kind', zh ? '来源类型' : 'Source kind', {
      type: 'select',
      required: true,
      constraints: {
        options: [
          { value: 'illustration', label: zh ? '说明素材' : 'Illustration' },
          { value: 'model-output', label: zh ? '模型输出' : 'Model output' },
        ],
      },
    }),
    modelNode('sourceLabel', zh ? '来源名称' : 'Source name', {
      required: true,
      constraints: { maxLength: 256 },
    }),
    modelNode('sourceUrl', zh ? '来源链接' : 'Source URL', { constraints: { maxLength: 2048 } }),
    modelNode('createdAt', zh ? '创建时间' : 'Created at', { type: 'date' }),
  ];
}

function variants(schema: FieldData): FieldData[] {
  const values = schema['anyOf'] ?? schema['oneOf'];
  return Array.isArray(values) ? values.filter(isFieldData) : [];
}

function scalarOptions(schema: FieldData): string[] {
  const values = Array.isArray(schema['enum'])
    ? schema['enum']
    : variants(schema).map((entry) => entry['const']);
  return values
    .filter(
      (value): value is string | number => typeof value === 'string' || typeof value === 'number',
    )
    .map(String);
}

function constraints(schema: FieldData): EditorNode['constraints'] {
  const result: EditorNode['constraints'] = {};
  if (schema['type'] === 'integer') result.precision = 0;
  for (const [source, target] of [
    ['minimum', 'min'],
    ['maximum', 'max'],
    ['minLength', 'minLength'],
    ['maxLength', 'maxLength'],
    ['minItems', 'minRows'],
    ['maxItems', 'maxRows'],
  ] as const) {
    const value = schema[source];
    if (typeof value === 'number') result[target] = value;
  }
  if (schema['default'] !== undefined) result.defaultValue = schema['default'];
  return result;
}

function schemaNode(name: string, schema: FieldData, required: boolean): EditorNode {
  const options = scalarOptions(schema);
  const { type } = schema;
  let node = modelNode(name, name, { required, constraints: constraints(schema) });
  if (type === 'object') node = { ...node, type: 'group', children: schemaLayout(schema) };
  else if (type === 'array') {
    const items = isFieldData(schema['items']) ? schema['items'] : {};
    const object = items['type'] === 'object';
    node = {
      ...node,
      type: object ? 'array' : 'json',
      children: object ? schemaLayout(items) : undefined,
      constraints: {
        ...node.constraints,
        min: node.constraints.minRows,
        max: node.constraints.maxRows,
      },
    };
  } else if (type === 'boolean') node = { ...node, type: 'boolean' };
  else if (
    options.length > 0 &&
    (type === 'number' ||
      type === 'integer' ||
      variants(schema).some((entry) => typeof entry['const'] === 'number'))
  )
    node = { ...node, type: 'number' };
  else if (options.length > 0)
    node = { ...node, type: 'select', constraints: { ...node.constraints, options } };
  else if (type === 'integer' || type === 'number') node = { ...node, type: 'number' };
  else if (['prompt', 'content', 'lyrics'].includes(name)) node = { ...node, type: 'textarea' };
  return node;
}

export function schemaLayout(value: JsonValue | undefined): EditorNode[] {
  if (!isFieldData(value) || !isFieldData(value['properties'])) return [];
  const required = Array.isArray(value['required']) ? value['required'] : [];
  return Object.entries(value['properties']).flatMap(([name, schema]) =>
    isFieldData(schema) ? [schemaNode(name, schema, required.includes(name))] : [],
  );
}

export function requestData(layout: readonly EditorNode[], value: FieldData): FieldData {
  let result = { ...value };
  for (const node of layout) {
    const name = node.name ?? '';
    const current = result[name];
    if (current === null && !node.required)
      result = Object.fromEntries(Object.entries(result).filter(([key]) => key !== name));
    else if (node.type === 'group' && isFieldData(current))
      result[name] = requestData(node.children ?? [], current);
    else if (node.type === 'array' && Array.isArray(current))
      result[name] = current.map((row) => {
        if (!isFieldData(row)) return row;
        const data = requestData(node.children ?? [], row);
        if (!node.children?.some((child) => child.name === 'id')) delete data['id'];
        return data;
      });
  }
  return result;
}
