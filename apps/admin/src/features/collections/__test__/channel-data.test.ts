import { expect, it } from 'vitest';
import type { EditorNode } from '../../../contracts/editor';
import { mergeEditorPatch, patchMatches } from '../channel-data';
import { writablePatch } from '../../fields/writable-data';
function node(type: EditorNode['type'], name: string): EditorNode {
  return {
    id: name,
    name,
    type,
    label: name,
    required: false,
    localized: false,
    write: 'allowed',
    constraints: {},
  };
}
const layout: EditorNode[] = [
  { ...node('array', 'rows'), children: [node('text', 'title'), node('text', 'summary')] },
  {
    ...node('blocks', 'blocks'),
    blocks: [
      {
        id: 'text',
        key: 'text',
        label: 'Text',
        children: [node('text', 'title'), node('text', 'summary')],
      },
    ],
  },
  node('json', 'settings'),
  { ...node('group', 'group'), children: [node('text', 'title'), node('text', 'summary')] },
];
it('regression: persisted JSON member order cannot keep an unchanged field dirty or prevent write verification', () => {
  const fields = [node('richText', 'body'), node('json', 'settings')];
  const saved = {
    body: {
      version: 1,
      children: [{ type: 'paragraph', children: [{ text: 'Persisted', type: 'text' }] }],
    },
    settings: { labels: ['first', 'second'], enabled: false },
  };
  const draft = {
    body: {
      children: [{ children: [{ type: 'text', text: 'Persisted' }], type: 'paragraph' }],
      version: 1,
    },
    settings: { enabled: false, labels: ['first', 'second'] },
  };
  expect(writablePatch(fields, saved, draft)).toEqual({});
  expect(patchMatches(fields, draft, saved)).toBe(true);
  expect(
    patchMatches(fields, { settings: { enabled: false, labels: ['second', 'first'] } }, saved),
  ).toBe(false);
  expect(patchMatches(fields, { settings: { enabled: false } }, saved)).toBe(false);
});
it('regression: a partial UUID array row patch preserves unmodified fields and follows the submitted order', () => {
  const result = mergeEditorPatch(
    layout,
    {
      rows: [
        { id: 'a', title: 'A', summary: 'Keep A' },
        { id: 'b', title: 'B', summary: 'Keep B' },
      ],
    },
    { rows: [{ id: 'b' }, { id: 'a', title: 'Changed A' }] },
  );
  expect(result['rows']).toEqual([
    { id: 'b', title: 'B', summary: 'Keep B' },
    { id: 'a', title: 'Changed A', summary: 'Keep A' },
  ]);
});
it('preserves block identity and unchanged child values without borrowing values from a different block type', () => {
  const result = mergeEditorPatch(
    layout,
    { blocks: [{ id: 'a', blockType: 'text', title: 'A', summary: 'Keep' }] },
    {
      blocks: [
        { id: 'a', blockType: 'text', title: 'Changed' },
        { id: 'b', blockType: 'text', title: 'New' },
      ],
    },
  );
  expect(result['blocks']).toEqual([
    { id: 'a', blockType: 'text', title: 'Changed', summary: 'Keep' },
    { id: 'b', blockType: 'text', title: 'New' },
  ]);
});
it('replaces a JSON value completely while merging only declared group children', () => {
  const result = mergeEditorPatch(
    layout,
    { settings: { keep: 'old', remove: 'old' }, group: { title: 'Original', summary: 'Keep' } },
    { settings: { keep: 'new' }, group: { title: 'Changed' } },
  );
  expect(result).toEqual({
    settings: { keep: 'new' },
    group: { title: 'Changed', summary: 'Keep' },
  });
});
it('verifies a UUID row patch against a full server row, including order and block type', () => {
  expect(
    patchMatches(
      layout,
      { rows: [{ id: 'a', title: 'New' }] },
      { rows: [{ id: 'a', title: 'New', summary: 'Keep' }] },
    ),
  ).toBe(true);
  expect(
    patchMatches(
      layout,
      { rows: [{ id: 'a' }, { id: 'b' }] },
      { rows: [{ id: 'b' }, { id: 'a' }] },
    ),
  ).toBe(false);
  expect(
    patchMatches(
      layout,
      { blocks: [{ id: 'a', blockType: 'text' }] },
      { blocks: [{ id: 'a', blockType: 'other' }] },
    ),
  ).toBe(false);
});
it('does not falsely confirm a JSON replacement while removed keys are still present on the server', () => {
  expect(
    patchMatches(
      layout,
      { settings: { keep: 'new' } },
      { settings: { keep: 'new', remove: 'old' } },
    ),
  ).toBe(false);
  expect(patchMatches(layout, { settings: { keep: 'new' } }, { settings: { keep: 'new' } })).toBe(
    true,
  );
});
it('merges and verifies named and unnamed tab data paths without generating layout fields', () => {
  const nodes: EditorNode[] = [
    {
      id: 'tabs',
      type: 'tabs',
      label: 'Tabs',
      required: false,
      localized: false,
      write: 'allowed',
      constraints: {},
      tabs: [
        {
          id: 'one',
          label: 'One',
          name: 'info',
          children: [node('text', 'title'), node('text', 'summary')],
        },
        { id: 'two', label: 'Two', children: [node('text', 'shared')] },
      ],
    },
  ];
  const next = mergeEditorPatch(
    nodes,
    { info: { title: 'Old', summary: 'Keep' }, shared: 'Before' },
    { info: { title: 'New' }, shared: 'After' },
  );
  expect(next).toEqual({ info: { title: 'New', summary: 'Keep' }, shared: 'After' });
  expect(patchMatches(nodes, { info: { title: 'New' }, shared: 'After' }, next)).toBe(true);
});
