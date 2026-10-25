import { describe, expect, it } from 'vitest';
import {
  addFieldRow,
  changeField,
  editorDefaults,
  fieldValue,
  moveFieldRow,
  pathName,
  rowData,
} from '../data';
import { initializeFieldData, newFieldData } from '../initialize-data';
import { writablePatch, writableValue } from '../writable-data';
import { dateInput, isJsonValue, parseDate, parseJson, parseNumber, parseText } from '../parsing';
import type { EditorNode } from '../../../contracts/editor';

function field(name: string, extra: Partial<EditorNode> = {}): EditorNode {
  return {
    id: name,
    name,
    type: 'text',
    label: name,
    write: 'allowed',
    required: false,
    localized: false,
    constraints: {},
    ...extra,
  };
}

const first = '019aad44-1df0-7000-8000-000000000001';
const second = '019aad44-1df0-7000-8000-000000000002';

describe('field paths and structural operations', () => {
  it('updates a nested array cell without mutating other rows or following inherited properties', () => {
    const data = {
      rows: [
        { id: first, title: 'A' },
        { id: second, title: 'B' },
      ],
      visible: false,
    };
    expect(changeField(data, ['rows', 1, 'title'], 'C')).toEqual({
      rows: [
        { id: first, title: 'A' },
        { id: second, title: 'C' },
      ],
      visible: false,
    });
    expect(fieldValue(data, ['rows', 0, 'title'])).toBe('A');
    expect(fieldValue(data, ['rows', 8, 'title'])).toBeUndefined();
    expect(fieldValue(data, ['constructor'])).toBeUndefined();
    expect(fieldValue(null, ['missing'])).toBeUndefined();
    expect(pathName(['rows', 1, 'title'])).toBe('rows.1.title');
    expect(data.rows[1]?.title).toBe('B');
    expect(changeField({}, ['settings', 'label'], 'New')).toEqual({ settings: { label: 'New' } });
    expect(changeField(data, [], null)).toBe(data);
    expect(changeField({}, [0], 'A')).toEqual({});
  });
  it('inserts a cloned block and preserves identity and order on move or cancellation', () => {
    const defaults = { nested: { title: 'Default' } };
    const rows = addFieldRow({
      value: [{ id: first, blockType: 'hero' }],
      defaults,
      id: second,
      blockType: 'hero',
    });
    expect(rows).toEqual([
      { id: first, blockType: 'hero' },
      { id: second, blockType: 'hero', nested: { title: 'Default' } },
    ]);
    expect(rows[1]?.['nested']).not.toBe(defaults.nested);
    expect(moveFieldRow(rows, 1, 0).map((row) => row['id'])).toEqual([second, first]);
    expect(moveFieldRow(rows, -1, 1)).toBe(rows);
    expect(moveFieldRow(rows, 0, 2)).toBe(rows);
    expect(moveFieldRow(rows, 1, 1)).toBe(rows);
    expect(moveFieldRow(rows, 2, 0)).toBe(rows);
    expect(rowData([null, 'bad', { id: first }])).toEqual([{ id: first }]);
    expect(rowData(null)).toEqual([]);
  });
  it('projects safe defaults through named and anonymous layout without inventing filtered fields', () => {
    const layout = [
      field('title', { constraints: { defaultValue: 'Draft' } }),
      field('flag', { type: 'boolean', constraints: { defaultValue: false } }),
      field('secret', { write: 'denied', constraints: { defaultValue: 'secret' } }),
      field('join', { type: 'join', constraints: { defaultValue: [] } }),
      field('group', {
        type: 'group',
        children: [field('caption', { constraints: { defaultValue: 'Caption' } })],
      }),
      field('layout', {
        name: undefined,
        type: 'tabs',
        tabs: [
          {
            id: 'named',
            name: 'meta',
            label: 'Meta',
            children: [field('label', { constraints: { defaultValue: 'SEO' } })],
          },
          {
            id: 'plain',
            label: 'Plain',
            children: [field('slug', { constraints: { defaultValue: 'draft' } })],
          },
        ],
      }),
    ];
    expect(editorDefaults(layout)).toEqual({
      title: 'Draft',
      flag: false,
      group: { caption: 'Caption' },
      meta: { label: 'SEO' },
      slug: 'draft',
    });
    expect(newFieldData(layout, () => first)).toEqual({
      title: 'Draft',
      flag: false,
      group: { caption: 'Caption' },
      meta: { label: 'SEO' },
      slug: 'draft',
    });
  });
  it('initializes row UUIDs once while retaining existing IDs, unknown blocks and malformed values for validation', () => {
    const layout = [
      field('items', {
        type: 'array',
        children: [
          field('blocks', {
            type: 'blocks',
            blocks: [
              {
                id: 'hero',
                key: 'hero',
                label: 'Hero',
                children: [field('nested', { type: 'array', children: [] })],
              },
            ],
          }),
        ],
      }),
    ];
    let count = 0;
    const initialize = () => {
      count += 1;
      return second;
    };
    const data = {
      items: [
        {
          id: first,
          blocks: [
            { blockType: 'hero', nested: [{ title: 'n' }] },
            { id: first, blockType: 'unknown', data: true },
          ],
        },
        null,
      ],
    };
    const value = initializeFieldData(layout, data, initialize);
    expect(value).toEqual({
      items: [
        {
          id: first,
          blocks: [
            { id: second, blockType: 'hero', nested: [{ id: second, title: 'n' }] },
            { id: first, blockType: 'unknown', data: true },
          ],
        },
        null,
      ],
    });
    expect(count).toBe(2);
    expect(initializeFieldData(layout, value, initialize)).toEqual(value);
    expect(count).toBe(2);
    expect(
      newFieldData(
        [
          field('items', {
            type: 'array',
            constraints: { defaultValue: [{ title: 'New' }] },
            children: [field('title')],
          }),
        ],
        () => second,
      ),
    ).toEqual({ items: [{ id: second, title: 'New' }] });
  });
});

describe('write projections', () => {
  it('emits changed visible writable paths and preserves false and explicit null', () => {
    const layout = [
      field('flag', { type: 'boolean' }),
      field('title'),
      field('secret', { write: 'denied' }),
      field('join', { type: 'join' }),
      field('group', {
        type: 'group',
        children: [field('caption'), field('hidden', { write: 'denied' })],
      }),
      field('row', { name: undefined, type: 'row', children: [field('slug')] }),
    ];
    expect(
      writablePatch(
        layout,
        { flag: true, title: 'A', group: { caption: 'old' } },
        {
          flag: false,
          title: null,
          secret: 'bad',
          join: [],
          group: { caption: 'new', hidden: 'bad' },
          slug: 'new',
          unknown: 'bad',
        },
      ),
    ).toEqual({ flag: false, title: null, group: { caption: 'new' }, slug: 'new' });
    expect(writablePatch(layout, { title: 'same' }, { title: 'same' })).toEqual({});
    expect(writablePatch(layout, {}, {})).toEqual({});
  });
  it('projects known block children while preserving every field of unknown blocks', () => {
    const node = field('blocks', {
      type: 'blocks',
      blocks: [
        {
          id: 'hero',
          key: 'hero',
          label: 'Hero',
          children: [field('title'), field('secret', { write: 'denied' })],
        },
      ],
    });
    expect(
      writableValue(node, [
        { id: first, blockType: 'hero', title: 'A', secret: 'B' },
        { id: second, blockType: 'extension', payload: { nested: true } },
        null,
      ]),
    ).toEqual([
      { id: first, blockType: 'hero', title: 'A' },
      { id: second, blockType: 'extension', payload: { nested: true } },
      null,
    ]);
    expect(
      writableValue(field('group', { type: 'group', children: [field('title')] }), {
        title: 'A',
        hidden: 'B',
      }),
    ).toEqual({ title: 'A' });
    expect(writableValue(field('items', { type: 'array' }), [{ title: 'A' }])).toEqual([{}]);
  });
  it('projects named tabs as nested patches and anonymous tabs at their parent', () => {
    const tabs = field('tabs', {
      name: undefined,
      type: 'tabs',
      tabs: [
        { id: 'a', name: 'seo', label: 'SEO', children: [field('title')] },
        { id: 'b', label: 'General', children: [field('slug')] },
      ],
    });
    expect(
      writablePatch([tabs], { seo: { title: 'old' } }, { seo: { title: 'new' }, slug: 'draft' }),
    ).toEqual({ seo: { title: 'new' }, slug: 'draft' });
    expect(writablePatch([tabs], {}, { seo: null })).toEqual({});
    expect(
      initializeFieldData([tabs], { seo: { title: 'new' }, slug: 'draft' }, () => first),
    ).toEqual({ seo: { title: 'new' }, slug: 'draft' });
  });
});

describe('raw value parsing', () => {
  it.each(['', '  '])(
    'keeps an empty number nullable instead of converting it to zero: %j',
    (text) => {
      expect(parseNumber(text, field('price', { type: 'number' }))).toEqual({
        valid: true,
        value: null,
      });
    },
  );
  it.each(['Infinity', 'NaN', '0x10', '1x', '--1'])(
    'rejects nondecimal or nonfinite numbers: %s',
    (text) => {
      expect(parseNumber(text, field('n', { type: 'number' })).valid).toBe(false);
    },
  );
  it('validates numeric bounds and decimal precision using the server tolerance', () => {
    const node = field('price', { type: 'number', constraints: { min: -1, max: 5, precision: 2 } });
    expect(parseNumber('0', node)).toEqual({ valid: true, value: 0 });
    expect(parseNumber('2.35', node).valid).toBe(true);
    expect(parseNumber('0.1e1', node).value).toBe(1);
    expect(parseNumber('-1.01', node).valid).toBe(false);
    expect(parseNumber('5.01', node).valid).toBe(false);
    expect(parseNumber('2.351', node).valid).toBe(false);
  });
  it('validates user-perceived characters and email while allowing incomplete draft null', () => {
    const text = field('label', { constraints: { minLength: 1, maxLength: 1 } });
    expect(parseText('👨‍👩‍👧‍👦', text).valid).toBe(true);
    expect(parseText('é', text).valid).toBe(true);
    expect(parseText('ab', text).valid).toBe(false);
    expect(parseText('', { ...text, required: true })).toEqual({ valid: true, value: null });
    expect(parseText('a', field('label', { constraints: { minLength: 2 } })).valid).toBe(false);
    expect(parseText('bad', field('email', { type: 'email' })).valid).toBe(false);
    expect(parseText('dev@example.com', field('email', { type: 'email' })).valid).toBe(true);
  });
  it('parses safe JSON, rejecting invalid syntax, prototype keys and nonfinite data recursively', () => {
    expect(parseJson('')).toEqual({ valid: true, value: null });
    expect(parseJson('{"enabled":false,"count":0,"list":[null,"A"]}')).toEqual({
      valid: true,
      value: { enabled: false, count: 0, list: [null, 'A'] },
    });
    for (const text of [
      '{',
      '{"nested":{"__proto__":{}}}',
      '{"constructor":1}',
      '{"prototype":0}',
      '1e999',
    ])
      expect(parseJson(text).valid).toBe(false);
    expect(isJsonValue(new Date())).toBe(false);
    const absent: unknown = Reflect.get({}, 'missing');
    expect(isJsonValue(absent)).toBe(false);
  });
  it('uses UTC ISO dates with millisecond precision and rejects calendar rollovers', () => {
    expect(parseDate('2026-10-26T01:02:03.456')).toEqual({
      valid: true,
      value: '2026-10-26T01:02:03.456Z',
    });
    expect(parseDate('2026-02-30T12:00').valid).toBe(false);
    expect(parseDate('bad').valid).toBe(false);
    expect(parseDate('')).toEqual({ valid: true, value: null });
    expect(dateInput('2026-10-26T09:02:03.456+08:00')).toBe('2026-10-26T01:02:03.456');
    expect(dateInput('bad')).toBe('');
    expect(dateInput(null)).toBe('');
  });
});

it('keeps every generated row UUID across several anonymous tabs and nested layout containers', () => {
  const layout = [
    field('row', {
      name: undefined,
      type: 'row',
      children: [
        field('first', { type: 'array' }),
        field('tabs', {
          name: undefined,
          type: 'tabs',
          tabs: [
            { id: 'a', label: 'A', children: [field('second', { type: 'array' })] },
            { id: 'b', label: 'B', children: [field('third', { type: 'array' })] },
          ],
        }),
      ],
    }),
  ];
  const initial = {
    first: [{ title: 'one' }],
    second: [{ title: 'two' }],
    third: [{ title: 'three' }],
  };
  const ids = [first, second, '019aad44-1df0-7000-8000-000000000003'];
  const result = initializeFieldData(layout, initial, () => ids.shift() ?? 'exhausted');
  expect(result).toEqual({
    first: [{ id: first, title: 'one' }],
    second: [{ id: second, title: 'two' }],
    third: [{ id: '019aad44-1df0-7000-8000-000000000003', title: 'three' }],
  });
  expect(
    initializeFieldData(layout, result, () => {
      throw new Error('Locale switch must preserve UUIDs');
    }),
  ).toEqual(result);
});
