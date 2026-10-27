import glyphs from '../assets/admin-og/glyph-ranges.json';
export const collectionOGPolicy = {
  width: 1200,
  maxConcurrentRenders: 2,
  workerMemoryMiB: 128,
  height: 630,
  maxTitleCharacters: 200,
  maxDescriptionCharacters: 500,
  maxImageBytes: 4 * 1024 * 1024,
  fontFile: 'src/assets/admin-og/noto-sans-sc.ttf',
} as const;
function supported(code: number): boolean {
  let first = 0;
  let last = glyphs.ranges.length - 1;
  while (first <= last) {
    const middle = Math.floor((first + last) / 2);
    const range = glyphs.ranges[middle];
    if (!range) return false;
    const [start, end] = range;
    if (start === undefined || end === undefined) return false;
    if (code < start) last = middle - 1;
    else if (code > end) first = middle + 1;
    else return true;
  }
  return false;
}
export function collectionOGText(value: string, maximum: number): string {
  return Array.from(value)
    .slice(0, maximum)
    .map((character) => {
      if (/\s/u.test(character)) return ' ';
      const code = character.codePointAt(0);
      return code !== undefined &&
        !/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u.test(character) &&
        code !== 0x200d &&
        code !== 0xfe0f &&
        supported(code)
        ? character
        : '?';
    })
    .join('');
}
