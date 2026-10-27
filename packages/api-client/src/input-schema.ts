import { z } from 'zod';

const object = z.record(z.string(), z.unknown());
function normalizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...schema };
  for (const key of ['$defs', 'definitions', 'properties', 'patternProperties']) {
    if (!normalized[key] || typeof normalized[key] !== 'object') continue;
    normalized[key] = Object.fromEntries(
      Object.entries(object.parse(normalized[key])).map(([name, value]) => [
        name,
        normalizeNode(value),
      ]),
    );
  }
  for (const key of [
    'items',
    'additionalProperties',
    'propertyNames',
    'contains',
    'not',
    'if',
    'then',
    'else',
  ]) {
    if (normalized[key] && typeof normalized[key] === 'object')
      normalized[key] = normalizeNode(normalized[key]);
  }
  for (const key of ['anyOf', 'oneOf', 'allOf', 'prefixItems']) {
    const nodes = normalized[key];
    if (Array.isArray(nodes)) normalized[key] = nodes.map(normalizeNode);
  }
  return distributeRequired(normalized);
}
function normalizeNode(value: unknown): unknown {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? normalizeSchema(object.parse(value))
    : value;
}
function distributeRequired(schema: Record<string, unknown>): Record<string, unknown> {
  const branches = z.array(object).safeParse(schema.anyOf);
  if (
    schema.type !== 'object' ||
    !branches.success ||
    !branches.data.every((branch) => Object.keys(branch).every((key) => key === 'required'))
  )
    return schema;
  const { anyOf: _branches, ...base } = schema;
  const required = z.array(z.string()).parse(base.required ?? []);
  return {
    anyOf: branches.data.map((branch) => ({
      ...base,
      required: [...new Set([...required, ...z.array(z.string()).parse(branch.required ?? [])])],
    })),
  };
}
export function compileInputSchema(schema: Record<string, unknown>): z.ZodType {
  return z.fromJSONSchema(normalizeSchema(schema));
}
