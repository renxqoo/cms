export function jsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function jsonString(value: Record<string, unknown>, key: string): string {
  const result = value[key];
  if (typeof result !== 'string') throw new Error(`Invalid Docker metadata field: ${key}`);
  return result;
}

export function singleObject(raw: unknown): Record<string, unknown> {
  if (!Array.isArray(raw) || raw.length !== 1) throw new Error('Unexpected Docker object count');
  const item: unknown = raw[0];
  if (!jsonObject(item)) throw new Error('Unexpected Docker object');
  return item;
}
