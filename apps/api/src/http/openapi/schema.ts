export interface Schema {
  [key: string]: unknown;
}

export const id = { type: 'string', format: 'uuid' };
export const time = { type: 'string', format: 'date-time' };
export const integer = { type: 'integer' };
export const text = { type: 'string' };

export function object(
  properties: Record<string, Schema>,
  optional: Record<string, Schema> = {},
): Schema {
  return {
    type: 'object',
    properties: { ...properties, ...optional },
    required: Object.keys(properties),
    additionalProperties: false,
  };
}
export function reference(name: string): Schema {
  return { $ref: `#/components/schemas/${name}` };
}
export function array(items: Schema): Schema {
  return { type: 'array', items };
}
export function page(name: string): Schema {
  return object({ rows: array(reference(name)), total: integer, page: integer, pageSize: integer });
}
export function nullable(schema: Schema): Schema {
  return { anyOf: [schema, { type: 'null' }] };
}
