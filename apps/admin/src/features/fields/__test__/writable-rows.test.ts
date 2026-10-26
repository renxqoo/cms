import { expect, it } from 'vitest';
import type { EditorNode } from '../../../contracts/editor';
import { writablePatch } from '../writable-data';

const first = '019aad44-1df0-7000-8000-000000000001';
const second = '019aad44-1df0-7000-8000-000000000002';
function field(name: string, extra: Partial<EditorNode> = {}): EditorNode {
  return {
    id: name,
    name,
    label: name,
    type: 'text',
    required: false,
    localized: false,
    write: 'allowed',
    constraints: {},
    ...extra,
  };
}
function layout(blocks: boolean) {
  const children = [
    field('title'),
    field('locked', { write: 'conditional' }),
    field('denied', { write: 'denied' }),
  ];
  return [
    field(
      'rows',
      blocks
        ? { type: 'blocks', blocks: [{ id: 'hero', key: 'hero', label: 'Hero', children }] }
        : { type: 'array', children },
    ),
  ];
}
it.each([false, true])(
  'does not resubmit unchanged conditional row children when editing a public title (blocks=%s)',
  (blocks) => {
    const kind = blocks ? { blockType: 'hero' } : {};
    const before = { rows: [{ id: first, ...kind, title: 'Before', locked: 'Keep' }] };
    const after = { rows: [{ id: first, ...kind, title: 'After', locked: 'Keep' }] };
    expect(writablePatch(layout(blocks), before, after)).toEqual({
      rows: [{ id: first, ...kind, title: 'After' }],
    });
  },
);
it.each([false, true])(
  'submits only row identity and order when reordering existing rows (blocks=%s)',
  (blocks) => {
    const kind = blocks ? { blockType: 'hero' } : {};
    const before = {
      rows: [
        { id: first, ...kind, title: 'One', locked: 'Keep one' },
        { id: second, ...kind, title: 'Two', locked: 'Keep two' },
      ],
    };
    const after = { rows: [before.rows[1] ?? {}, before.rows[0] ?? {}] };
    expect(writablePatch(layout(blocks), before, after)).toEqual({
      rows: [
        { id: second, ...kind },
        { id: first, ...kind },
      ],
    });
  },
);
it.each([false, true])(
  'submits a conditional child when the user actually changes its value (blocks=%s)',
  (blocks) => {
    const kind = blocks ? { blockType: 'hero' } : {};
    expect(
      writablePatch(
        layout(blocks),
        { rows: [{ id: first, ...kind, title: 'Keep', locked: 'Before' }] },
        { rows: [{ id: first, ...kind, title: 'Keep', locked: 'After' }] },
      ),
    ).toEqual({ rows: [{ id: first, ...kind, locked: 'After' }] });
  },
);
it.each([false, true])(
  'keeps provided writable fields on newly added rows and omits denied data (blocks=%s)',
  (blocks) => {
    const kind = blocks ? { blockType: 'hero' } : {};
    expect(
      writablePatch(
        layout(blocks),
        { rows: [{ id: first, ...kind, title: 'Old' }] },
        {
          rows: [
            { id: first, ...kind, title: 'Old' },
            { id: second, ...kind, title: 'New', locked: 'Provided', denied: 'Never' },
          ],
        },
      ),
    ).toEqual({
      rows: [
        { id: first, ...kind },
        { id: second, ...kind, title: 'New', locked: 'Provided' },
      ],
    });
  },
);
it('preserves old row context recursively through groups and nested arrays', () => {
  const nodes = [
    field('rows', {
      type: 'array',
      children: [
        field('group', {
          type: 'group',
          children: [
            field('title'),
            field('locked', { write: 'conditional' }),
            field('items', {
              type: 'array',
              children: [field('title'), field('locked', { write: 'conditional' })],
            }),
          ],
        }),
      ],
    }),
  ];
  const before = {
    rows: [
      {
        id: first,
        group: {
          title: 'Keep',
          locked: 'Keep group',
          items: [{ id: second, title: 'Before', locked: 'Keep nested' }],
        },
      },
    ],
  };
  const after = {
    rows: [
      {
        id: first,
        group: {
          title: 'Keep',
          locked: 'Keep group',
          items: [{ id: second, title: 'After', locked: 'Keep nested' }],
        },
      },
    ],
  };
  expect(writablePatch(nodes, before, after)).toEqual({
    rows: [{ id: first, group: { items: [{ id: second, title: 'After' }] } }],
  });
});
it('treats the same UUID with a changed block type as a new block and retains its new writable fields', () => {
  const nodes = [
    field('rows', {
      type: 'blocks',
      blocks: [
        { id: 'hero', key: 'hero', label: 'Hero', children: [field('title')] },
        { id: 'quote', key: 'quote', label: 'Quote', children: [field('title')] },
      ],
    }),
  ];
  expect(
    writablePatch(
      nodes,
      { rows: [{ id: first, blockType: 'hero', title: 'Keep' }] },
      { rows: [{ id: first, blockType: 'quote', title: 'Keep' }] },
    ),
  ).toEqual({ rows: [{ id: first, blockType: 'quote', title: 'Keep' }] });
});
