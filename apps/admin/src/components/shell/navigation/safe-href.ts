export function safeAppHref(value: string): boolean {
  for (const character of value) {
    if (character.charCodeAt(0) <= 32 || character === '\\') return false;
  }
  return (
    (value.startsWith('/') && !value.startsWith('//')) ||
    value.startsWith('#') ||
    value.startsWith('?')
  );
}
