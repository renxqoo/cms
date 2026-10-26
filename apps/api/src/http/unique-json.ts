import { CmsError } from '@new-cms/cms/platform/contracts';

interface JsonFrame {
  object: boolean;
  key: boolean;
  keys: Set<string>;
}

export function uniqueJson(text: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new CmsError('invalid_input');
  }
  const frames: JsonFrame[] = [];
  for (const match of text.matchAll(/"(?:\\.|[^"\\])*"|[{}[\]:,]/g)) {
    const [token] = match;
    if (token === '{' || token === '[')
      frames.push({ object: token === '{', key: token === '{', keys: new Set() });
    else if (token === '}' || token === ']') frames.pop();
    else processMember(frames.at(-1), token);
  }
  return value;
}

function processMember(frame: JsonFrame | undefined, token: string): void {
  if (!frame?.object) return;
  if (token === ',') {
    frame.key = true;
    return;
  }
  if (!frame.key || !token.startsWith('"')) return;
  const name: unknown = JSON.parse(token);
  if (typeof name !== 'string' || frame.keys.has(name)) throw new CmsError('invalid_input');
  frame.keys.add(name);
  frame.key = false;
}
