import type { PublicObject } from './contracts.ts';
import { record, text } from './source.ts';
import { publicObject } from './value.ts';

function nullable(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
function callout(value: unknown) {
  if (value == null) return null;
  return { ...publicObject(value), id: 'docs-introduction-callout' };
}
function cta(value: unknown, id?: string) {
  if (value == null) return null;
  const source = record(value);
  return { ...publicObject(value), ...(id ? { id } : {}), eyebrow: nullable(source['eyebrow']) };
}
function block(value: unknown): PublicObject {
  const source = record(value);
  const { blockType, ...data } = publicObject(value);
  let type = blockType;
  if (blockType === 'rich_text') type = 'richText';
  if (blockType === 'code_tabs') type = 'codeTabs';
  if (blockType === 'field_table') type = 'fieldTable';
  if (typeof type !== 'string') return data;
  if (type === 'cta') return { ...cta(data), type };
  return {
    ...data,
    type,
    ...(['code', 'codeTabs', 'image'].includes(type)
      ? { caption: nullable(source['caption']) }
      : {}),
  };
}
export function projectDocumentBody(value: unknown): PublicObject {
  const source = record(value);
  const intro = record(source['introduction']);
  const sections = Array.isArray(source['sections']) ? source['sections'] : [];
  return {
    version: 'docs-body.v1',
    introduction: {
      ...publicObject(intro),
      anchor: 'docs-title',
      eyebrow: nullable(intro['eyebrow']),
      callout: callout(intro['callout']),
    },
    sections: sections.map((entry) => {
      const section = record(entry);
      return {
        ...publicObject(section),
        navigationLabel: text(section['navigationLabel']) || text(section['title']),
        blocks: Array.isArray(section['blocks']) ? section['blocks'].map(block) : [],
      };
    }),
    next: cta(source['next'], 'docs-next'),
  };
}
