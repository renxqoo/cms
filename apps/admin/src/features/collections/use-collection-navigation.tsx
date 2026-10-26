'use client';

import type { ShellGroup } from '../../components/shell/shell-surface';
import { collectionListSchema } from '../../contracts/content';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { contentMessages } from './messages';
import {
  collectionBreadcrumbs,
  collectionMenuEntry,
  collectionNavigation,
} from './navigation-model';

export function useCollectionNavigation(input: {
  groups: readonly ShellGroup[];
  pathname: string;
  locale: 'zh' | 'en';
}) {
  const access = useAccessControl();
  const entry = collectionMenuEntry(input.groups);
  const allowed = access.can('collections.list');
  const result = useApiQuery({
    operation: 'collections.list',
    response: collectionListSchema,
    enabled: Boolean(entry) && allowed,
    contextKey: JSON.stringify([access.principal.roleId, access.operations, access.navigation]),
  });
  const collections =
    result.phase === 'ready' && allowed
      ? (result.data?.rows ?? []).filter((collection) =>
          access.can('collections.get', { scopeKind: 'collection', collectionKey: collection.key }),
        )
      : [];
  const t = contentMessages[input.locale];
  const message = !allowed
    ? t.denied
    : result.phase === 'failed'
      ? t.failed
      : result.phase !== 'ready'
        ? t.loading
        : collections.length === 0
          ? t.emptyTitle
          : null;
  const groups = collectionNavigation({
    groups: input.groups,
    collections,
    overviewLabel: t.overview,
  });
  return {
    groups: groups.map((group) =>
      group.id === 'collection-navigation' && message
        ? {
            ...group,
            feedback: (
              <p
                role={result.phase === 'failed' ? 'alert' : 'status'}
                className="px-3 py-2 text-xs text-muted-foreground"
              >
                {message}
              </p>
            ),
          }
        : group,
    ),
    breadcrumbs: collectionBreadcrumbs({ ...input, collections }),
  };
}
