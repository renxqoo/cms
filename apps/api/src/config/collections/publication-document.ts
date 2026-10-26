import type { DocumentData, JsonValue } from '@new-cms/cms/content/generate';
import { projectDocumentBody } from '@new-cms/cms/content/delivery';

function object(value: JsonValue | undefined): DocumentData {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function list(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}
function blockIdentities(items: readonly JsonValue[]): JsonValue[] | null {
  const ids: JsonValue[] = [];
  for (const entry of items) {
    const block = object(entry);
    ids.push(block['id'] ?? null);
    if (block['blockType'] === 'steps' || block['blockType'] === 'accordion')
      ids.push(...list(block['items']).map((item) => object(item)['id'] ?? null));
    if (block['blockType'] === 'code_tabs' && !validTabs(block)) return null;
  }
  return ids;
}
function validTabs(block: DocumentData) {
  const keys = list(block['items']).map((item) => object(item)['key']);
  return (
    keys.length > 0 &&
    new Set(keys).size === keys.length &&
    keys.every((key) => typeof key === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(key))
  );
}
export function validDocumentBody(data: DocumentData): boolean {
  const body = object(data['body']);
  if (Buffer.byteLength(JSON.stringify(projectDocumentBody(body))) > 1_048_576) return false;
  const intro = object(body['introduction']);
  const sections = list(body['sections']);
  const ids: JsonValue[] = ['docs-title'];
  let blocks = 0;
  if (intro['callout'] != null) ids.push('docs-introduction-callout');
  if (body['next'] != null) ids.push('docs-next');
  for (const sectionValue of sections) {
    const section = object(sectionValue);
    const { anchor } = section;
    if (typeof anchor !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(anchor)) return false;
    ids.push(section['id'] ?? null, anchor);
    const items = list(section['blocks']);
    blocks += items.length;
    const blockIds = blockIdentities(items);
    if (!blockIds) return false;
    ids.push(...blockIds);
  }
  return (
    sections.length <= 30 &&
    blocks <= 300 &&
    ids.every((id) => typeof id === 'string') &&
    new Set(ids).size === ids.length
  );
}
