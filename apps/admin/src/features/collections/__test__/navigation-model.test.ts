import { expect, it } from 'vitest';
import { adminIcons } from '../../../config/admin-routes';
import type { ShellGroup } from '../../../components/shell/shell-surface';
import { collectionBreadcrumbs, collectionNavigation } from '../navigation-model';

const groups: ShellGroup[] = [
  {
    id: 'content',
    label: 'Content',
    items: [
      { href: '/dashboard/collections', label: 'Editorial', icon: adminIcons.collections },
      { href: '/dashboard/resources', label: 'Files', icon: adminIcons.resources },
    ],
  },
];

it('moves only the catalog into an independent group while preserving collection order and other entries', () => {
  const result = collectionNavigation({
    groups,
    overviewLabel: 'Overview',
    collections: [
      { key: 'media', label: 'Images', upload: true },
      { key: 'articles', label: 'News', upload: false },
    ],
  });
  expect(result.map((group) => group.label)).toEqual(['Editorial', 'Content']);
  expect(result[0]?.items.map((item) => [item.label, item.href])).toEqual([
    ['Images', '/dashboard/collections/media'],
    ['News', '/dashboard/collections/articles'],
  ]);
  expect(result[1]?.items.map((item) => item.href)).toEqual(['/dashboard/resources']);
  expect(result[0]?.items[0]?.icon).not.toBe(result[0]?.items[1]?.icon);
});

it('does not manufacture a catalog entry when it is absent or disabled', () => {
  const collections = [{ key: 'articles', label: 'News', upload: false }];
  const disabled = [
    {
      ...groups[0],
      id: 'disabled',
      label: 'Disabled',
      items: [
        {
          href: '/dashboard/collections',
          label: 'Unavailable',
          icon: adminIcons.collections,
          disabled: true,
        },
      ],
    },
  ];
  expect(collectionNavigation({ groups: disabled, collections, overviewLabel: 'Overview' })).toBe(
    disabled,
  );
  expect(collectionNavigation({ groups: [], collections, overviewLabel: 'Overview' })).toEqual([]);
});

it('keeps an overview recovery destination and removes an emptied original group', () => {
  const [group] = groups;
  const [catalog] = group?.items ?? [];
  if (!catalog) throw new Error('Expected catalog fixture.');
  const result = collectionNavigation({
    groups: [{ id: 'content', label: 'Content', items: [catalog] }],
    collections: [],
    overviewLabel: 'View collections',
  });
  expect(result).toHaveLength(1);
  expect(result[0]?.items.map((item) => [item.label, item.href])).toEqual([
    ['View collections', '/dashboard/collections'],
  ]);
});

it.each([
  '/dashboard/collections',
  '/dashboard/collections/articles/invalid',
  '/dashboard/resources',
])('leaves non-detail or invalid paths to the existing breadcrumbs: %s', (pathname) => {
  expect(collectionBreadcrumbs({ pathname, collections: [], locale: 'en' })).toBeNull();
});

it('uses the exact collection segment and readable key fallback before metadata arrives', () => {
  expect(
    collectionBreadcrumbs({
      pathname: '/dashboard/collections/articles2/new',
      collections: [{ key: 'articles', label: 'News', upload: false }],
      locale: 'zh',
    }),
  ).toEqual([
    { id: 'collections', label: '内容集合', href: '/dashboard/collections' },
    { id: 'collection', label: 'articles2', href: '/dashboard/collections/articles2' },
    { id: 'collection-action', label: '新建文档' },
  ]);
});
