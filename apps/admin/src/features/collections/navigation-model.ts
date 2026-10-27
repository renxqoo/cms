import { adminIcons, getAdminRoute, matchAdminRoute } from '../../config/admin-routes';
import type { ShellGroup } from '../../components/shell/shell-surface';
import type { Collection } from '../../contracts/content';
import { contentMessages } from './messages';
import { collectionHref } from './query';

type CollectionEntry = Pick<Collection, 'key' | 'label' | 'upload' | 'admin'>;

export function collectionMenuEntry(groups: readonly ShellGroup[]) {
  return groups
    .flatMap((group) => group.items)
    .find((item) => item.href === getAdminRoute('collections').path && !item.disabled);
}

export function collectionNavigation(input: {
  groups: readonly ShellGroup[];
  collections: readonly CollectionEntry[];
  overviewLabel: string;
}) {
  const entry = collectionMenuEntry(input.groups);
  if (!entry) return input.groups;
  const sections = collectionSections(input.collections, entry);
  const replaced = new Set([
    entry.href,
    ...input.collections.map((collection) => collectionHref(collection.key)),
  ]);
  const result: ShellGroup[] = [];
  for (const group of input.groups) {
    if (group.items.includes(entry))
      result.push(
        ...(sections.length > 0
          ? sections
          : [
              {
                id: 'collection-navigation',
                label: entry.label,
                items: [{ ...entry, label: input.overviewLabel }],
              },
            ]),
      );

    const remaining = group.items.filter((item) => !replaced.has(item.href));
    if (remaining.length > 0) result.push({ ...group, items: remaining });
  }
  return result;
}

export function navigableCollection(collection: Pick<Collection, 'admin'>): boolean {
  return collection.admin?.hidden !== true && collection.admin?.group !== false;
}

function collectionSections(
  collections: readonly CollectionEntry[],
  entry: NonNullable<ReturnType<typeof collectionMenuEntry>>,
): ShellGroup[] {
  const sections = new Map<string, ShellGroup>();
  for (const collection of collections.filter(navigableCollection)) {
    const label =
      typeof collection.admin?.group === 'string' ? collection.admin.group : entry.label;
    const id =
      typeof collection.admin?.group === 'string'
        ? `collection-navigation:${encodeURIComponent(label)}`
        : 'collection-navigation';
    const section = sections.get(id) ?? { id, label, items: [] };
    sections.set(id, {
      ...section,
      items: [
        ...section.items,
        {
          href: collectionHref(collection.key),
          label: collection.label,
          icon: collection.upload ? adminIcons.resources : adminIcons.collections,
        },
      ],
    });
  }
  return [...sections.values()];
}

export function collectionBreadcrumbs(input: {
  pathname: string;
  collections: readonly CollectionEntry[];
  locale: 'zh' | 'en';
}) {
  const route = matchAdminRoute(input.pathname);
  if (route?.id !== 'collections' || input.pathname === route.path) return null;
  const [key, action] = input.pathname.slice(route.path.length + 1).split('/');
  if (!key) return null;
  const collection = input.collections.find((item) => item.key === key);
  const t = contentMessages[input.locale];
  const actionLabels: Readonly<Record<string, string>> = { new: t.create, structure: t.structure };
  const breadcrumbs: { id: string; label: string; href?: string }[] = [
    { id: 'collections', label: route.label[input.locale], href: route.path },
    {
      id: 'collection',
      label: collection?.label ?? key,
      ...(action ? { href: collectionHref(key) } : {}),
    },
  ];
  if (action)
    breadcrumbs.push({
      id: 'collection-action',
      label: actionLabels[action] ?? t.edit,
    });
  return breadcrumbs;
}
