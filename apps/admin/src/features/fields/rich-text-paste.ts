import { fieldEditorPolicy } from './policy';
import { richTextFormats, safeRichTextLink } from './rich-text-value';
import type { RichTextFormat, RichTextValue } from './rich-text-value';
import type { FieldData } from './types';

const blockedTags = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'SVG',
  'MATH',
  'TEMPLATE',
  'NOSCRIPT',
  'META',
  'LINK',
  'IMG',
  'VIDEO',
  'AUDIO',
  'SOURCE',
  'INPUT',
]);
const tagFormats: Readonly<Record<string, RichTextFormat>> = {
  B: 'bold',
  STRONG: 'bold',
  I: 'italic',
  EM: 'italic',
  U: 'underline',
  S: 'strikethrough',
  STRIKE: 'strikethrough',
  DEL: 'strikethrough',
  SUB: 'subscript',
  SUP: 'superscript',
  CODE: 'code',
};

function formats(element: HTMLElement, inherited: readonly RichTextFormat[]): RichTextFormat[] {
  const next = new Set(inherited);
  const tagged = tagFormats[element.tagName];
  if (tagged) next.add(tagged);
  if (['bold', 'bolder', '600', '700', '800', '900'].includes(element.style.fontWeight))
    next.add('bold');
  if (element.style.fontStyle === 'italic') next.add('italic');
  if (element.style.textDecoration.includes('underline')) next.add('underline');
  if (element.style.textDecoration.includes('line-through')) next.add('strikethrough');
  if (next.has('subscript') && next.has('superscript'))
    next.delete(tagged === 'superscript' ? 'subscript' : 'superscript');
  return richTextFormats.filter((format) => next.has(format));
}

function merged(nodes: FieldData[]): FieldData[] {
  const result: FieldData[] = [];
  for (const node of nodes) {
    const previous = result.at(-1);
    if (
      previous?.['type'] === 'text' &&
      node['type'] === 'text' &&
      typeof previous['text'] === 'string' &&
      typeof node['text'] === 'string' &&
      JSON.stringify(previous['format']) === JSON.stringify(node['format'])
    )
      previous['text'] = previous['text'] + node['text'];
    else result.push(node);
  }
  return result;
}

function inline(node: FieldData) {
  return node['type'] === 'text' || node['type'] === 'link';
}

function blocks(nodes: FieldData[]): FieldData[] {
  const result: FieldData[] = [];
  let children: FieldData[] = [];
  function flush() {
    if (
      children.some(
        (node) =>
          node['type'] !== 'text' ||
          (typeof node['text'] === 'string' && node['text'].trim() !== ''),
      )
    )
      result.push({ type: 'paragraph', children: merged(children) });
    children = [];
  }
  for (const node of nodes) {
    if (inline(node)) children.push(node);
    else {
      flush();
      result.push(node);
    }
  }
  flush();
  return result;
}

interface PasteInput {
  inherited: readonly RichTextFormat[];
  depth: number;
  budget: { count: number };
}

function list(source: HTMLElement, children: FieldData[]): FieldData {
  let kind = 'bullet';
  if (source.tagName === 'OL') kind = 'number';
  else if (source.getAttribute('data-list-type') === 'check') kind = 'check';
  const start = Number(source.getAttribute('start') ?? 1);
  return {
    type: 'list',
    ...(kind !== 'bullet' ? { kind } : {}),
    ...(kind === 'number' && Number.isInteger(start) && start > 1 && start <= 2_147_483_647
      ? { start }
      : {}),
    children: children.filter((child) => child['type'] === 'listItem'),
  };
}

function quoteChildren(children: FieldData[]): FieldData[] {
  const result: FieldData[] = [];
  for (const child of children) {
    if (child['type'] === 'paragraph' && Array.isArray(child['children'])) {
      if (result.length > 0) result.push({ type: 'text', text: '\n' });
      for (const item of child['children'])
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) result.push(item);
    } else result.push(child);
  }
  return merged(result);
}

function link(source: HTMLElement, children: FieldData[]): FieldData[] {
  const url = source.getAttribute('href');
  return safeRichTextLink(url) ? [{ type: 'link', url, children }] : children;
}

function container(source: HTMLElement, children: FieldData[]): FieldData[] {
  const align = source.style.textAlign;
  const attributes = ['left', 'center', 'right', 'justify'].includes(align) ? { align } : {};
  if (/^H[1-6]$/.test(source.tagName))
    return [
      {
        type: 'heading',
        ...(source.tagName !== 'H2' ? { level: Number(source.tagName.slice(1)) } : {}),
        ...attributes,
        children,
      },
    ];
  if (source.tagName === 'P' || source.tagName === 'DIV')
    return children.some((child) => !inline(child))
      ? blocks(children)
      : [{ type: 'paragraph', ...attributes, children }];
  if (source.tagName === 'BLOCKQUOTE')
    return [{ type: 'quote', ...attributes, children: quoteChildren(children) }];
  if (source.tagName === 'UL' || source.tagName === 'OL') return [list(source, children)];
  if (source.tagName === 'LI')
    return [
      {
        type: 'listItem',
        ...(source.parentElement?.getAttribute('data-list-type') === 'check'
          ? { checked: source.getAttribute('aria-checked') === 'true' }
          : {}),
        children,
      },
    ];
  if (source.tagName === 'A') return link(source, children);
  return children;
}

function convert(source: Node, input: PasteInput): FieldData[] {
  input.budget.count += 1;
  if (
    input.budget.count > fieldEditorPolicy.richTextPasteNodes ||
    input.depth > fieldEditorPolicy.richTextPasteDepth
  )
    throw new Error('Rich-text paste budget exceeded');
  if (source.nodeType === Node.TEXT_NODE)
    return source.textContent
      ? [
          {
            type: 'text',
            text: source.textContent,
            ...(input.inherited.length > 0 ? { format: [...input.inherited] } : {}),
          },
        ]
      : [];
  if (!(source instanceof HTMLElement) || blockedTags.has(source.tagName)) return [];
  if (source.tagName === 'BR') return [{ type: 'text', text: '\n' }];
  if (source.tagName === 'HR') return [{ type: 'horizontalRule' }];
  const inherited = formats(source, input.inherited);
  const children = merged(
    Array.from(source.childNodes).flatMap((child) =>
      convert(child, { inherited, depth: input.depth + 1, budget: input.budget }),
    ),
  );
  return container(source, children);
}

export function parseRichTextHtml(html: string): RichTextValue | null {
  if (new TextEncoder().encode(html).length > fieldEditorPolicy.richTextPasteBytes) return null;
  const template = document.createElement('template');
  template.innerHTML = html;
  const input: PasteInput = { inherited: [], depth: 1, budget: { count: 0 } };
  try {
    const children = blocks(
      Array.from(template.content.childNodes).flatMap((node) => convert(node, input)),
    );
    return children.length > 0 ? { version: 1, children } : null;
  } catch {
    return null;
  }
}
