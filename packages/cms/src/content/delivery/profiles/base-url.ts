import { isIP } from 'node:net';

function validHost(hostname: string): boolean {
  const host =
    hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  if (isIP(host)) return true;
  return (
    hostname.length <= 253 &&
    hostname.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))
  );
}
export function validApiBaseUrl(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    /[\s\\]/u.test(value) ||
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) < 32 ||
        (character.charCodeAt(0) >= 127 && character.charCodeAt(0) <= 159),
    )
  )
    return false;
  try {
    const url = new URL(value);
    const local =
      url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return (
      (local || url.protocol === 'https:') &&
      validHost(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === '/v1'
    );
  } catch {
    return false;
  }
}
