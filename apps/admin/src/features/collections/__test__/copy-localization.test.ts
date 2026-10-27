import { expect, it } from 'vitest';
import { synchronizeSharedValues } from '../copy-localization';
import type { EditorNode } from '../../../contracts/editor';

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

it('propagates shared dependency changes to other copy languages while preserving their localized data', () => {
  const layout = [
    field('enabled', { type: 'boolean' }),
    field('title', { localized: true }),
    field('group', {
      type: 'group',
      children: [field('shared'), field('caption', { localized: true })],
    }),
  ];
  expect(
    synchronizeSharedValues({
      layout,
      before: { enabled: false, title: 'English', group: { shared: 'old', caption: 'EN' } },
      next: { enabled: true, title: 'New English', group: { shared: 'new', caption: 'New EN' } },
      other: { enabled: false, title: '中文', group: { shared: 'old', caption: 'ZH' } },
    }),
  ).toEqual({ enabled: true, title: '中文', group: { shared: 'new', caption: 'ZH' } });
});

it('keeps localized row content attached to stable ids during shared copy reordering and leaves new translations empty', () => {
  const layout = [
    field('rows', { type: 'array', children: [field('kind'), field('text', { localized: true })] }),
  ];
  expect(
    synchronizeSharedValues({
      layout,
      before: {
        rows: [
          { id: 'a', kind: 'old', text: 'A' },
          { id: 'b', kind: 'old', text: 'B' },
        ],
      },
      next: {
        rows: [
          { id: 'b', kind: 'new', text: 'B' },
          { id: 'a', kind: 'old', text: 'A' },
          { id: 'c', kind: 'added', text: 'C' },
        ],
      },
      other: {
        rows: [
          { id: 'a', kind: 'old', text: '甲' },
          { id: 'b', kind: 'old', text: '乙' },
        ],
      },
    }),
  ).toEqual({
    rows: [
      { id: 'b', kind: 'new', text: '乙' },
      { id: 'a', kind: 'old', text: '甲' },
      { id: 'c', kind: 'added' },
    ],
  });
});
