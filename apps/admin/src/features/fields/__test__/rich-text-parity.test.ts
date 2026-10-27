import { expect, it } from 'vitest';
import { createEditor, $getRoot } from 'lexical';
import { $toggleLink } from '@lexical/link';
import { $insertInternalDocumentLink } from '../rich-text-internal-link';
import { prepareRichText, richTextLexicalNodes, $exportRichText } from '../rich-text-mapping';
import { parseRichText } from '../rich-text-value';
import type { RichTextValue } from '../rich-text-value';

it('regression: formatted article content stays visually editable and roundtrips every supported format', () => {
  const value: RichTextValue = {
    version: 1,
    children: [
      {
        type: 'heading',
        level: 1,
        align: 'center',
        children: [{ type: 'text', text: 'Title', format: ['bold', 'italic'] }],
      },
      {
        type: 'paragraph',
        indent: 2,
        align: 'justify',
        children: [{ type: 'text', text: 'Body', format: ['underline', 'strikethrough', 'code'] }],
      },
      { type: 'quote', children: [{ type: 'text', text: 'Quote', format: ['superscript'] }] },
      {
        type: 'list',
        kind: 'number',
        start: 3,
        children: [{ type: 'listItem', children: [{ type: 'text', text: 'Ordered' }] }],
      },
      {
        type: 'list',
        kind: 'check',
        children: [
          {
            type: 'listItem',
            checked: true,
            children: [{ type: 'text', text: 'Done', format: ['subscript'] }],
          },
        ],
      },
      { type: 'horizontalRule' },
    ],
  };
  expect(parseRichText(value)).toEqual(value);
  const prepared = prepareRichText(value);
  expect(prepared).not.toBeNull();
  if (!prepared) throw new Error('Formatted content must remain visually editable');
  const editor = createEditor({ nodes: richTextLexicalNodes });
  editor.setEditorState(editor.parseEditorState(prepared));
  expect(editor.getEditorState().read($exportRichText)).toEqual(value);
});

it('keeps nested list ordering and checklist completion stable across editor reconstruction', () => {
  const value: RichTextValue = {
    version: 1,
    children: [
      {
        type: 'list',
        kind: 'number',
        children: [
          { type: 'listItem', children: [{ type: 'text', text: 'Parent' }] },
          {
            type: 'listItem',
            children: [
              {
                type: 'list',
                kind: 'check',
                children: [
                  {
                    type: 'listItem',
                    checked: false,
                    children: [{ type: 'text', text: 'Nested' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const prepared = prepareRichText(value);
  expect(prepared).not.toBeNull();
  if (!prepared) throw new Error('Nested lists must remain visually editable');
  const editor = createEditor({ nodes: richTextLexicalNodes });
  editor.setEditorState(editor.parseEditorState(prepared));
  expect(editor.getEditorState().read($exportRichText)).toEqual(value);
});

it('regression: internal document links preserve their stable reference and formatted text across editor reconstruction', () => {
  const value: RichTextValue = {
    version: 1,
    children: [
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            reference: { collection: 'pages', id: '10000000-0000-4000-8000-000000000003' },
            children: [{ type: 'text', text: 'Document label', format: ['bold'] }],
          },
        ],
      },
    ],
  };
  expect(parseRichText(value)).toEqual(value);
  const prepared = prepareRichText(value);
  expect(prepared).not.toBeNull();
  if (!prepared) throw new Error('Internal link must remain visually editable');
  const editor = createEditor({ nodes: richTextLexicalNodes });
  editor.setEditorState(editor.parseEditorState(prepared));
  expect(editor.getEditorState().read($exportRichText)).toEqual(value);
});

it('internal links preserve selected text formats and can be changed back to a normal URL without retaining a hidden reference', () => {
  const editor = createEditor({ nodes: richTextLexicalNodes });
  const initial: RichTextValue = {
    version: 1,
    children: [
      { type: 'paragraph', children: [{ type: 'text', text: 'Selected', format: ['bold'] }] },
    ],
  };
  const prepared = prepareRichText(initial);
  if (!prepared) throw new Error('Missing prepared paragraph');
  editor.setEditorState(editor.parseEditorState(prepared));
  const reference = { collection: 'pages', id: '10000000-0000-4000-8000-000000000003' };
  editor.update(
    () => {
      $getRoot().select(0, 1);
      $insertInternalDocumentLink(reference, 'Fallback');
    },
    { discrete: true },
  );
  expect(editor.getEditorState().read($exportRichText)).toEqual({
    version: 1,
    children: [
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            reference,
            children: [{ type: 'text', text: 'Selected', format: ['bold'] }],
          },
        ],
      },
    ],
  });
  editor.update(
    () => {
      $getRoot().select(0, 1);
      $toggleLink('https://example.com/article');
    },
    { discrete: true },
  );
  expect(editor.getEditorState().read($exportRichText)).toEqual({
    version: 1,
    children: [
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            url: 'https://example.com/article',
            children: [{ type: 'text', text: 'Selected', format: ['bold'] }],
          },
        ],
      },
    ],
  });
});
