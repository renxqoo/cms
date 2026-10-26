export function validParameterKey(key: string): boolean {
  return !['__proto__', 'constructor', 'prototype'].includes(key);
}
function plainObject(value: object) {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function jsonShape(value: unknown, depth: number, budget: { entries: number }): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || depth > 8) return false;
  if (!Array.isArray(value) && !plainObject(value)) return false;
  const entries = Object.entries(value);
  if (Array.isArray(value) && entries.length !== value.length) return false;
  for (const [key, child] of entries)
    if (!validParameterKey(key) || ++budget.entries > 256 || !jsonShape(child, depth + 1, budget))
      return false;
  return true;
}
export function validParameterValue(value: unknown): boolean {
  if (value === null || !jsonShape(value, 1, { entries: 0 })) return false;
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    return serialized !== undefined && Array.from(serialized).length <= 12000;
  } catch {
    return false;
  }
}
export function validParameterValues(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(
    ([key, child]) => validParameterKey(key) && validParameterValue(child),
  );
}
