import { NativeSelect } from '@new-cms/ui/forms';
import type { Collection } from '../../contracts/content';
import type { PermissionQuery } from './permission-query';
import { permissionMessages } from './permission-messages';

export function PermissionFilters({
  query,
  collections,
  change,
  locale,
}: {
  query: PermissionQuery;
  collections: Collection[] | null;
  change: (changes: Partial<PermissionQuery>) => void;
  locale: 'zh' | 'en';
}) {
  const t = permissionMessages[locale];
  return (
    <>
      <NativeSelect
        aria-label={t.status}
        value={query.status ?? ''}
        onChange={(event) =>
          change({
            status:
              event.target.value === 'active' || event.target.value === 'disabled'
                ? event.target.value
                : undefined,
          })
        }
      >
        <option value="">{t.all}</option>
        <option value="active">{t.active}</option>
        <option value="disabled">{t.disabled}</option>
      </NativeSelect>
      <NativeSelect
        aria-label={t.scope}
        value={query.scopeKind ?? ''}
        onChange={(event) =>
          change({
            scopeKind:
              event.target.value === 'global' || event.target.value === 'collection'
                ? event.target.value
                : undefined,
          })
        }
      >
        <option value="">{t.all}</option>
        <option value="global">{t.global}</option>
        <option value="collection">{t.collection}</option>
      </NativeSelect>
      {query.scopeKind !== 'global' ? (
        <NativeSelect
          aria-label={t.collectionKey}
          value={query.collectionKey ?? ''}
          disabled={collections === null}
          onChange={(event) => change({ collectionKey: event.target.value || undefined })}
        >
          <option value="">{t.all}</option>
          {collections?.map((collection) => (
            <option key={collection.key} value={collection.key}>
              {collection.label}
            </option>
          ))}
        </NativeSelect>
      ) : null}
    </>
  );
}
