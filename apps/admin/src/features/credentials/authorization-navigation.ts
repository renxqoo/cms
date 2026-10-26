export function authorizationReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\/authorize\?request=[a-zA-Z0-9_-]{1,512}$/.test(value))
    return null;
  return value;
}

export function authorizationDestination(value: string, expected?: string): string | null {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return null;
    if (expected && !matchesCallback(url, expected)) return null;
    if (url.protocol === 'https:') return url.href;
    if (url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname))
      return url.href;
  } catch {
    return null;
  }
  return null;
}

function matchesCallback(url: URL, expected: string) {
  const callback = new URL(expected);
  return (
    url.origin === callback.origin &&
    url.pathname === callback.pathname &&
    [...callback.searchParams.keys()].every(
      (key) =>
        JSON.stringify(callback.searchParams.getAll(key)) ===
        JSON.stringify(url.searchParams.getAll(key)),
    )
  );
}

export function returnToAuthorizationClient(value: string, expected?: string): boolean {
  const destination = authorizationDestination(value, expected);
  if (!destination) return false;
  window.location.replace(destination);
  return true;
}

export function returnToAuthorizationLogin(requestId: string): void {
  const destination = authorizationReturnPath(`/authorize?request=${requestId}`);
  const query = new URLSearchParams({ reason: 'expired' });
  if (destination) query.set('next', destination);
  window.location.replace(`/login?${query}`);
}
