import { $createInternalDocumentLink, $internalDocumentReference } from './rich-text-internal-link';
import { fieldEditorPolicy } from './policy';
import {
  $createHeadingNode,
  $isHeadingNode,
  $createQuoteNode,
  $isQuoteNode,
  HeadingNode,
  QuoteNode,
} from '@lexical/rich-text';
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
} from '@lexical/react/LexicalHorizontalRuleNode';
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
import { equalFieldValue, isFieldData } from './data';
import type { FieldData } from './types';
import type { RichTextValue } from './rich-text-value';
import { richTextFormats } from './rich-text-value';
import { alignment, headingTag } from './rich-text-schema';

export const richTextLexicalNodes = [
  HeadingNode,
  QuoteNode,
  HorizontalRuleNode,
  ListNode,
  ListItemNode,
  LinkNode,
  CmsReferenceNode,
];

function importLeaf(node: FieldData): LexicalNode | null {
  if (node['type'] === 'text' && typeof node['text'] === 'string') {
    const text = $createTextNode(node['text']);
    for (const format of richTextFormats)
      if (Array.isArray(node['format']) && node['format'].includes(format))
        text.toggleFormat(format);
    return text;
  }
  if (node['type'] === 'horizontalRule') return $createHorizontalRuleNode();
  if (
    (node['type'] === 'relationship' || node['type'] === 'media') &&
    typeof node['collection'] === 'string' &&
    typeof node['id'] === 'string'
  )
    return $createCmsReference({
      kind: node['type'],
      reference: { collection: node['collection'], id: node['id'] },
    });
  return null;
}

function importNode(node: FieldData): LexicalNode {
  const leaf = importLeaf(node);
  if (leaf) return leaf;
  const element = importContainer(node);
  element.setFormat(alignment(node['align']));
  if (typeof node['indent'] === 'number') element.setIndent(node['indent']);
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
      return $createHeadingNode(headingTag(node['level']));
    case 'quote':
      return $createQuoteNode();
    case 'list':
      return $createListNode(
        node['kind'] === 'number' || node['kind'] === 'check' ? node['kind'] : 'bullet',
        typeof node['start'] === 'number' ? node['start'] : 1,
      );
    case 'listItem':
      return $createListItemNode(
        typeof node['checked'] === 'boolean' ? node['checked'] : undefined,
      );
    case 'link':
      return importLink(node);
    default:
      throw new Error('Unsupported rich-text node');
  }
}

function blockAttributes(node: ElementNode): FieldData {
  const align = node.getFormatType();
  const indent = $isListItemNode(node) ? 0 : node.getIndent();
  if (align !== '' && !['left', 'center', 'right', 'justify'].includes(align))
    throw new Error('Unsupported element formatting');
  if (indent < 0 || indent > fieldEditorPolicy.richTextMaxIndent)
    throw new Error('Unsupported element indentation');
  return { ...(align ? { align } : {}), ...(indent ? { indent } : {}) };
}

function exportNode(node: LexicalNode): FieldData {
  if ($isTextNode(node)) {
    const format = richTextFormats.filter((value) => node.hasFormat(value));
    const unsupported = ['highlight', 'lowercase', 'uppercase', 'capitalize'] as const;
    if (unsupported.some((value) => node.hasFormat(value)) || node.getStyle() !== '')
      throw new Error('Unsupported text formatting');
    return { type: 'text', text: node.getTextContent(), ...(format.length > 0 ? { format } : {}) };
  }
  if ($isLineBreakNode(node)) return { type: 'text', text: '\n' };
  if ($isHorizontalRuleNode(node)) return { type: 'horizontalRule' };
  if (node instanceof CmsReferenceNode) return { type: node.kind(), ...node.reference() };
  if (!$isElementNode(node)) throw new Error('Unsupported element');
  return exportContainer(node);
}

function exportList(node: ListNode, attributes: FieldData, children: FieldData[]): FieldData {
  return {
    type: 'list',
    ...(node.getListType() !== 'bullet' ? { kind: node.getListType() } : {}),
    ...(node.getListType() === 'number' && node.getStart() !== 1 ? { start: node.getStart() } : {}),
    ...attributes,
    children,
  };
}

function exportContainer(node: ElementNode): FieldData {
  const attributes = blockAttributes(node);
  const children = node.getChildren().map(exportNode);
  if ($isParagraphNode(node)) return { type: 'paragraph', ...attributes, children };
  if ($isHeadingNode(node))
    return {
      type: 'heading',
      ...(node.getTag() !== 'h2' ? { level: Number(node.getTag().slice(1)) } : {}),
      ...attributes,
      children,
    };
  if ($isQuoteNode(node)) return { type: 'quote', ...attributes, children };
  if ($isListNode(node)) return exportList(node, attributes, children);
  if ($isListItemNode(node))
    return {
      type: 'listItem',
      ...(node.getChecked() !== undefined ? { checked: node.getChecked() === true } : {}),
      ...attributes,
      children,
    };
  if ($isLinkNode(node)) {
    const reference = $internalDocumentReference(node);
    return {
      type: 'link',
      ...(reference ? { reference: { ...reference } } : { url: node.getURL() }),
      children,
    };
  }
  throw new Error('Unsupported rich-text node');
}

export function $importRichText(value: RichTextValue) {
  $getRoot()
    .clear()
    .append(...value.children.map(importNode));
}

export function $richTextNodes(value: RichTextValue): LexicalNode[] {
  return value.children.map(importNode);
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
    if (value.children.length > 0 && !equalFieldValue(output.children, value.children)) return null;
    return JSON.stringify(editor.getEditorState().toJSON());
  } catch {
    return null;
  }
}

function importLink(node: FieldData): ElementNode {
  if (
    isFieldData(node['reference']) &&
    typeof node['reference']['collection'] === 'string' &&
    typeof node['reference']['id'] === 'string'
  )
    return $createInternalDocumentLink({
      collection: node['reference']['collection'],
      id: node['reference']['id'],
    });
  if (typeof node['url'] === 'string') return $createLinkNode(node['url']);
  throw new Error('Unsupported link');
}
