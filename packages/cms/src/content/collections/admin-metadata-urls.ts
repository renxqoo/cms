const urlFields = new Set([
  'url',
  'secureUrl',
  'href',
  'canonical',
  'manifest',
  'metadataBase',
  'archives',
  'assets',
  'bookmarks',
  'previous',
  'next',
  'playerUrl',
  'streamUrl',
  'appArgument',
  'startupImage',
]);
const graphFields = new Set([
  'images',
  'videos',
  'audio',
  'authors',
  'actors',
  'directors',
  'writers',
  'series',
  'creators',
  'musicians',
  'albums',
  'songs',
]);
function URLPath(path: readonly string[]): boolean {
  const key = path.at(-1) ?? '';
  if (urlFields.has(key)) return true;
  if (path[0] === 'twitter' && path[1] === 'app' && path[2] === 'url') return true;
  if (path[0] === 'icons' && path.length <= 2) return true;
  if (['openGraph', 'twitter'].includes(path[0] ?? '') && graphFields.has(key)) return true;
  return (
    path[0] === 'alternates' &&
    ['languages', 'media', 'types'].includes(path[1] ?? '') &&
    path.length === 3
  );
}
function safeURL(value: string, absolute: boolean): boolean {
  if (
    !value ||
    value.startsWith('//') ||
    value.includes('\\') ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    )
  )
    return false;
  try {
    const url = absolute ? new URL(value) : new URL(value, 'https://metadata.invalid/');
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}
export function invalidMetadataURL(value: unknown): string[] | undefined {
  const pending = [{ value, path: [] as string[] }];
  while (pending.length > 0) {
    const entry = pending.pop();
    if (!entry) break;
    if (typeof entry.value === 'string') {
      if (URLPath(entry.path) && !safeURL(entry.value, entry.path.at(-1) === 'metadataBase'))
        return entry.path;
    } else if (Array.isArray(entry.value))
      for (const child of entry.value) pending.push({ value: child, path: entry.path });
    else if (entry.value && typeof entry.value === 'object')
      for (const [key, child] of Object.entries(entry.value))
        pending.push({ value: child, path: [...entry.path, key] });
  }
  return undefined;
}
