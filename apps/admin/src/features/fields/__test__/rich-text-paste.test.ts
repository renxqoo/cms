import { expect, it } from 'vitest';
import { parseRichTextHtml } from '../rich-text-paste';
import { parseRichText } from '../rich-text-value';

it('preserves supported pasted formatting while removing executable content and arbitrary styling', () => {
  const result = parseRichTextHtml(
    '<h1 style="text-align:center;color:red">Title</h1><p><b>Bold</b> <em>Italic</em><script>alert(1)</script><a href="javascript:alert(1)" onclick="alert(1)">unsafe link</a><img src=x onerror="alert(1)"></p><hr>',
  );
  expect(result).toEqual({
    version: 1,
    children: [
      { type: 'heading', level: 1, align: 'center', children: [{ type: 'text', text: 'Title' }] },
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'Bold', format: ['bold'] },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'Italic', format: ['italic'] },
          { type: 'text', text: 'unsafe link' },
        ],
      },
      { type: 'horizontalRule' },
    ],
  });
  expect(parseRichText(result)).toEqual(result);
});

it('imports ordered lists, checklists, safe links, quotations and semantic inline formats', () => {
  const result = parseRichTextHtml(
    '<ol start="3"><li>Third</li><li>Fourth</li></ol><ul data-list-type="check"><li aria-checked="true">Done</li><li>Open</li></ul><blockquote><p><a href="/docs">Docs</a><sub>2</sub><sup>3</sup><code>code</code><u>line</u><s>gone</s></p></blockquote>',
  );
  expect(result).toEqual({
    version: 1,
    children: [
      {
        type: 'list',
        kind: 'number',
        start: 3,
        children: [
          { type: 'listItem', children: [{ type: 'text', text: 'Third' }] },
          { type: 'listItem', children: [{ type: 'text', text: 'Fourth' }] },
        ],
      },
      {
        type: 'list',
        kind: 'check',
        children: [
          { type: 'listItem', checked: true, children: [{ type: 'text', text: 'Done' }] },
          { type: 'listItem', checked: false, children: [{ type: 'text', text: 'Open' }] },
        ],
      },
      {
        type: 'quote',
        children: [
          { type: 'link', url: '/docs', children: [{ type: 'text', text: 'Docs' }] },
          { type: 'text', text: '2', format: ['subscript'] },
          { type: 'text', text: '3', format: ['superscript'] },
          { type: 'text', text: 'code', format: ['code'] },
          { type: 'text', text: 'line', format: ['underline'] },
          { type: 'text', text: 'gone', format: ['strikethrough'] },
        ],
      },
    ],
  });
});

it('groups inline clipboard text into paragraphs and keeps explicit line breaks', () => {
  expect(
    parseRichTextHtml(
      'Before<br><span style="font-weight:700;font-style:italic;text-decoration:underline line-through">after</span><div><p>Nested paragraph</p></div>',
    ),
  ).toEqual({
    version: 1,
    children: [
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'Before\n' },
          { type: 'text', text: 'after', format: ['bold', 'italic', 'underline', 'strikethrough'] },
        ],
      },
      { type: 'paragraph', children: [{ type: 'text', text: 'Nested paragraph' }] },
    ],
  });
});

it('bounds clipboard parsing before admitting deeply nested, huge or executable-only markup', () => {
  expect(
    parseRichTextHtml('<script>doSomething()</script><img src=x onerror=attack()>'),
  ).toBeNull();
  expect(parseRichTextHtml(`<p>${'x'.repeat(1_048_577)}</p>`)).toBeNull();
  expect(parseRichTextHtml(`${'<div>'.repeat(20)}text${'</div>'.repeat(20)}`)).toBeNull();
  expect(parseRichTextHtml(`<p>${'<b>x</b>'.repeat(10_001)}</p>`)).toBeNull();
});
