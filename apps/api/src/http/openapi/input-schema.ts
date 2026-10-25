export interface InputSchema {
  properties?: Record<string, unknown>;
  required?: string[];
  anyOf?: InputSchema[];
  oneOf?: InputSchema[];
  allOf?: InputSchema[];
  [key: string]: unknown;
}

export function inputProperties(schema: InputSchema): Record<string, unknown> {
  const result = { ...schema.properties };
  for (const branch of [...(schema.anyOf ?? []), ...(schema.oneOf ?? []), ...(schema.allOf ?? [])])
    Object.assign(result, inputProperties(branch));
  return result;
}

export function bodySchema(schema: InputSchema, path: string): InputSchema {
  const result = { ...schema };
  if (schema.properties) {
    result.properties = Object.fromEntries(
      Object.entries(schema.properties).filter(([name]) => !path.includes(`:${name}`)),
    );
    if (schema.required)
      result.required = schema.required.filter((name) => name in (result.properties ?? {}));
  }
  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    const branches = schema[key];
    if (branches) result[key] = branches.map((branch) => bodySchema(branch, path));
  }
  return result;
}
