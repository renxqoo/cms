import type { DocumentData, JsonValue } from '@new-cms/cms/content/generate';

function object(value: JsonValue): value is DocumentData {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function forbidden(value: string) {
  return (
    /[\s\\]/u.test(value) ||
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) < 32 ||
        (character.charCodeAt(0) >= 127 && character.charCodeAt(0) <= 159),
    )
  );
}
export function validInternalPath(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.length > 2048) return false;
  try {
    const decoded = decodeURIComponent(value);
    return (
      !decoded.startsWith('//') &&
      !forbidden(decoded) &&
      !decoded
        .split(/[?#]/u)[0]
        ?.split('/')
        .some((part) => part === '.' || part === '..')
    );
  } catch {
    return false;
  }
}
export function validExternalUrl(value: unknown, protocols: readonly string[]) {
  if (typeof value !== 'string' || value.length > 2048 || forbidden(value)) return false;
  try {
    const target = new URL(value);
    return protocols.includes(target.protocol) && !target.username && !target.password;
  } catch {
    return false;
  }
}
export function validRichTextUrl(value: unknown) {
  return validInternalPath(value) || validExternalUrl(value, ['https:', 'http:']);
}
function validAnchor(value: JsonValue | undefined) {
  return value == null || (typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value));
}
export function validPublicLink(value: JsonValue): boolean {
  if (!object(value) || typeof value['label'] !== 'string' || !value['label'].trim()) return false;
  if (value['kind'] === 'internal')
    return validInternalPath(value['path']) && validAnchor(value['anchor']);
  if (value['kind'] === 'action')
    return (
      value['action'] === 'console' &&
      (value['section'] == null ||
        (typeof value['section'] === 'string' &&
          ['overview', 'keys', 'usage'].includes(value['section'])))
    );
  return value['kind'] === 'external' && validExternalUrl(value['url'], ['https:']);
}
