export function safeHref(value: string | null | undefined, image = false): string | undefined {
  if (value == null || value.trim() === '') return undefined;
  const compact = Array.from(value)
    .filter((character) => character.charCodeAt(0) > 32 && character.charCodeAt(0) !== 127)
    .join('');
  const protocol = /^([a-z][a-z\d+.-]*):/i.exec(compact)?.[1]?.toLowerCase();
  if (
    protocol &&
    !(image ? ['http', 'https', 'blob'] : ['http', 'https', 'mailto', 'tel']).includes(protocol)
  )
    return undefined;
  return value;
}
