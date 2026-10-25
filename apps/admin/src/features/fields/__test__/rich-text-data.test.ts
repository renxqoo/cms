import { describe, expect, it } from 'vitest';
import { $getRoot, $isElementNode, $isTextNode, createEditor } from 'lexical';
import { $createHeadingNode } from '@lexical/rich-text';
import {
  $exportRichText,
  $importRichText,
  prepareRichText,
  richTextLexicalNodes,
} from '../rich-text-mapping';
import { parseRichText, richTextData, richTextNode, safeRichTextLink } from '../rich-text-value';
import type { RichTextValue } from '../rich-text-value';

const id = '019aad44-1df0-7000-8000-000000000001';
const sample: RichTextValue = {
  version: 1,
  children: [
    { type: 'heading', children: [{ type: 'text', text: 'Title <script>' }] },
    {
      type: 'paragraph',
      children: [
        { type: 'text', text: 'Read ' },
        { type: 'link', url: '/docs?q=1', children: [{ type: 'text', text: 'docs' }] },
        { type: 'relationship', collection: 'pages', id },
        { type: 'media', collection: 'images', id },
      ],
    },
    {
      type: 'list',
      children: [
        { type: 'listItem', children: [{ type: 'text', text: 'First' }] },
        { type: 'listItem', children: [{ type: 'text', text: 'Second' }] },
      ],
    },
  ],
};

describe('rich text AST safety and lossless conversion', () => {
  it('roundtrips all built-in rich nodes and preserves references and literal HTML as text', () => {
    const prepared = prepareRichText(sample);
    expect(prepared).not.toBeNull();
    const editor = createEditor({ nodes: richTextLexicalNodes });
    if (!prepared) throw new Error('Expected representable AST');
    editor.setEditorState(editor.parseEditorState(prepared));
    expect(editor.getEditorState().read($exportRichText)).toEqual(sample);
    expect(parseRichText(sample)).toEqual(sample);
    expect(richTextData(sample)).toEqual(sample);
  });
  it('keeps the entire AST in structure editing when Lexical would merge or drop nodes', () => {
    const adjacent: RichTextValue = {
      version: 1,
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'A' },
            { type: 'text', text: 'B' },
          ],
        },
      ],
    };
    expect(prepareRichText(adjacent)).toBeNull();
    expect(adjacent.children).toEqual([
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'A' },
          { type: 'text', text: 'B' },
        ],
      },
    ]);
    expect(
      prepareRichText({ version: 1, children: [{ type: 'text', text: 'Root text' }] }),
    ).toBeNull();
    expect(
      prepareRichText({ version: 1, children: [{ type: 'custom', payload: { safe: true } }] }),
    ).toBeNull();
    expect(
      prepareRichText({
        version: 1,
        children: [{ type: 'paragraph', children: [{ type: 'text', text: '' }] }],
      }),
    ).toBeNull();
    expect(prepareRichText({ version: 1, children: [{ type: 'link', children: [] }] })).toBeNull();
  });
  it('allows an empty visual entry without writing an invented paragraph to the source value', () => {
    const source: RichTextValue = { version: 1, children: [] };
    expect(prepareRichText(source)).not.toBeNull();
    expect(source.children).toEqual([]);
  });
  it('safely preserves registered extension data and rejects unregistered or malformed ASTs', () => {
    const custom = {
      version: 1,
      children: [{ type: 'callout', version: '2', payload: { text: 'Hello' } }],
    };
    expect(parseRichText(custom, [{ type: 'callout', version: '2' }])).toEqual(custom);
    expect(parseRichText(custom)).toBeNull();
    for (const value of [
      null,
      [],
      {},
      { version: 2, children: [] },
      { version: 1, children: [], extra: true },
      { version: 1, children: [1] },
      { version: 1, children: [{ type: 'text', text: 1 }] },
      { version: 1, children: [{ type: 'text', text: 'X', marks: ['bold'] }] },
      { version: 1, children: [{ type: 'heading', level: 3, children: [] }] },
      { version: 1, children: [{ type: 'paragraph', children: false }] },
      { version: 1, children: [{ type: 'relationship', collection: 'pages', id: 'bad' }] },
      { version: 1, children: [{ type: 'media', collection: 'images', id, extra: true }] },
      { version: 1, children: [{ type: 'link', url: 'javascript:alert(1)', children: [] }] },
    ])
      expect(parseRichText(value)).toBeNull();
  });
  it.each([
    '/docs',
    '/a?x=1#anchor',
    'https://example.com/path',
    'http://example.com',
    'mailto:dev@example.com',
    'tel:+12025550123',
  ])('permits a safe URL: %s', (value) => expect(safeRichTextLink(value)).toBe(true));
  it.each([
    '//evil.test',
    '/\\evil.test',
    '/has space',
    '/null\u0000',
    'javascript:alert(1)',
    'data:text/html,<script>',
    'https:\n//evil.test',
    'relative',
    '',
    null,
  ])('rejects an unsafe or unsupported URL: %s', (value) =>
    expect(safeRichTextLink(value)).toBe(false),
  );
  it('refuses formatting and heading levels which cannot be persisted by the backend', () => {
    const editor = createEditor({ nodes: richTextLexicalNodes });
    editor.update(
      () => {
        $importRichText({
          version: 1,
          children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Hello' }] }],
        });
        const paragraph = $getRoot().getFirstChild();
        const text = $isElementNode(paragraph) ? paragraph.getFirstChild() : null;
        if ($isTextNode(text)) text.setFormat('bold');
      },
      { discrete: true },
    );
    expect(() => editor.getEditorState().read($exportRichText)).toThrow(
      'Unsupported text formatting',
    );
    editor.update(() => $getRoot().clear().append($createHeadingNode('h1')), { discrete: true });
    expect(() => editor.getEditorState().read($exportRichText)).toThrow(
      'Unsupported rich-text node',
    );
  });
  it('creates structural nodes whose editable data is explicit', () => {
    expect(richTextNode('paragraph')).toEqual({ type: 'paragraph', children: [] });
    expect(richTextNode('text')).toEqual({ type: 'text', text: '' });
    expect(richTextNode('link')).toEqual({
      type: 'link',
      url: 'https://',
      children: [{ type: 'text', text: '' }],
    });
    expect(richTextNode('list')).toEqual({
      type: 'list',
      children: [{ type: 'listItem', children: [{ type: 'text', text: '' }] }],
    });
  });
});
