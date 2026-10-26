import { $createHeadingNode, $isHeadingNode, HeadingNode } from '@lexical/rich-text';
import { $createLinkNode, $isLinkNode, LinkNode } from '@lexical/link';
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  ListItemNode,
  ListNode,
} from '@lexical/list';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isLineBreakNode,
  $isParagraphNode,
  $isTextNode,
  createEditor,
} from 'lexical';
import type { ElementNode, LexicalNode } from 'lexical';
import { $createCmsReference, CmsReferenceNode } from './rich-text-reference';
import { isFieldData } from './data';
import type { FieldData } from './types';
import type { RichTextValue } from './rich-text-value';

export const richTextLexicalNodes = [
  HeadingNode,
  ListNode,
  ListItemNode,
  LinkNode,
  CmsReferenceNode,
];

function importNode(node: FieldData): LexicalNode {
  if (node['type'] === 'text' && typeof node['text'] === 'string')
    return $createTextNode(node['text']);
  if (
    (node['type'] === 'relationship' || node['type'] === 'media') &&
    typeof node['collection'] === 'string' &&
    typeof node['id'] === 'string'
  )
    return $createCmsReference({
      kind: node['type'],
      reference: { collection: node['collection'], id: node['id'] },
    });
  const element = importContainer(node);
  if (!Array.isArray(node['children'])) throw new Error('Unsupported rich-text node');
  for (const child of node['children']) {
    if (!isFieldData(child)) throw new Error('Unsupported rich-text child');
    element.append(importNode(child));
  }
  return element;
}

function importContainer(node: FieldData): ElementNode {
  const type = typeof node['type'] === 'string' ? node['type'] : '';
  switch (type) {
    case 'paragraph':
      return $createParagraphNode();
    case 'heading':
      return $createHeadingNode('h2');
    case 'list':
      return $createListNode('bullet');
    case 'listItem':
      return $createListItemNode();
    case 'link':
      if (typeof node['url'] === 'string') return $createLinkNode(node['url']);
      throw new Error('Unsupported link');
    default:
      throw new Error('Unsupported rich-text node');
  }
}

function plainElement(node: LexicalNode): node is ElementNode {
  return $isElementNode(node) && node.getIndent() === 0 && node.getFormat() === 0;
}

function exportNode(node: LexicalNode): FieldData {
  if ($isTextNode(node)) {
    if (node.getFormat() !== 0 || node.getStyle() !== '')
      throw new Error('Unsupported text formatting');
    return { type: 'text', text: node.getTextContent() };
  }
  if ($isLineBreakNode(node)) return { type: 'text', text: '\n' };
  if (node instanceof CmsReferenceNode) return { type: node.kind(), ...node.reference() };
  if (!plainElement(node)) throw new Error('Unsupported element');
  const children = node.getChildren().map(exportNode);
  if ($isParagraphNode(node)) return { type: 'paragraph', children };
  if ($isHeadingNode(node) && node.getTag() === 'h2') return { type: 'heading', children };
  if ($isListNode(node) && node.getListType() === 'bullet') return { type: 'list', children };
  if ($isListItemNode(node)) return { type: 'listItem', children };
  if ($isLinkNode(node)) return { type: 'link', url: node.getURL(), children };
  throw new Error('Unsupported rich-text node');
}

export function $importRichText(value: RichTextValue) {
  $getRoot()
    .clear()
    .append(...value.children.map(importNode));
}

export function $exportRichText(): RichTextValue {
  return { version: 1, children: $getRoot().getChildren().map(exportNode) };
}

export function prepareRichText(value: RichTextValue): string | null {
  const editor = createEditor({
    nodes: richTextLexicalNodes,
    onError: (error) => {
      throw error;
    },
  });
  try {
    editor.update(
      () => {
        $importRichText(value);
        if (value.children.length === 0) $getRoot().append($createParagraphNode());
      },
      { discrete: true },
    );
    const output = editor.getEditorState().read($exportRichText);
    if (value.children.length > 0 && JSON.stringify(output) !== JSON.stringify(value)) return null;
    return JSON.stringify(editor.getEditorState().toJSON());
  } catch {
    return null;
  }
}
