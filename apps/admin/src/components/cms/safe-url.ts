export function safeResourceUrl(value?: string, allowBlob = false): string | null {
  if (
    !value ||
    value !== value.trim() ||
    Array.from(value).some((character) => character.charCodeAt(0) <= 32)
  )
    return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return value;
    if (allowBlob && url.protocol === 'blob:') return value;
  } catch {
    return null;
  }
  return null;
}
