export function segment(value: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('Invalid path segment');
  return encodeURIComponent(value);
}

export function queryValue(key: string, value: unknown): string {
  if (['where', 'sort', 'select', 'fallback', 'joins', 'groupBy', 'queryByGroup'].includes(key)) {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error('Invalid query value');
    return encoded;
  }
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  throw new Error('Invalid query value');
}
