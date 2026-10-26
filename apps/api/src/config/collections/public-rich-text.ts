import type { JsonValue, DocumentData } from '@new-cms/cms/content/generate';
import { validRichTextUrl } from './public-link.ts';

function object(value: JsonValue | undefined): value is DocumentData {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function placement(type: string, parent: string) {
  if (parent === 'root' && ['text', 'link', 'listItem'].includes(type)) return false;
  if (parent === 'list') return type === 'listItem';
  if (type === 'listItem') return false;
  if (['paragraph', 'heading'].includes(parent))
    return ['text', 'link', 'relationship'].includes(type);
  return parent !== 'link' || type === 'text';
}
export function validPublicRichText(value: JsonValue): boolean {
  if (!object(value) || value['version'] !== 1 || !Array.isArray(value['children'])) return false;
  let nodes = 1;
  function visit(node: JsonValue, depth: number, parent: string): boolean {
    if (!object(node) || ++nodes > 5000 || depth > 16) return false;
    const { type } = node;
    if (typeof type !== 'string' || !placement(type, parent)) return false;
    if (type === 'text') return typeof node['text'] === 'string';
    if (type === 'media' || type === 'relationship')
      return typeof node['collection'] === 'string' && typeof node['id'] === 'string';
    if (
      !['paragraph', 'heading', 'list', 'listItem', 'link'].includes(type) ||
      !Array.isArray(node['children'])
    )
      return false;
    return (
      (type !== 'link' || validRichTextUrl(node['url'])) &&
      node['children'].every((child) => visit(child, depth + 1, type))
    );
  }
  return value['children'].every((node) => visit(node, 1, 'root'));
}
