'use client';

import { Field, NativeSelect } from '@new-cms/ui/forms';
import { useShell } from '../../components/shell/shell-provider';
import { useAccessControl } from '../access-control/provider';
import type { Collection } from '../../contracts/content';
import type { DocumentQuery } from './query';
import { groupingMessages } from './grouping-messages';

export function GroupingControl({
  collection,
  query,
  change,
}: {
  collection: Collection;
  query: DocumentQuery;
  change: (patch: Partial<DocumentQuery>) => void;
}) {
  const locale = useShell((state) => state.locale);
  const t = groupingMessages[locale];
  const access = useAccessControl();
  const fields = collection.fields.filter((field) => field.groupable && !field.disabled?.groupBy);
  if (
    fields.length === 0 ||
    !access.can('documents.groups', { scopeKind: 'collection', collectionKey: collection.key })
  )
    return null;
  return (
    <>
      <Field id="list-group-by" label={t.groupBy}>
        <NativeSelect
          value={query.groupBy?.field ?? ''}
          onChange={(event) =>
            change({
              groupBy: event.currentTarget.value
                ? { field: event.currentTarget.value, order: query.groupBy?.order ?? 'asc' }
                : null,
              queryByGroup: undefined,
            })
          }
        >
          <option value="">{t.none}</option>
          {fields.map((field) => (
            <option key={field.path} value={field.path}>
              {field.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {query.groupBy ? (
        <NativeSelect
          aria-label={t.groupBy}
          value={query.groupBy.order}
          onChange={(event) => {
            if (query.groupBy)
              change({
                groupBy: {
                  ...query.groupBy,
                  order: event.currentTarget.value === 'desc' ? 'desc' : 'asc',
                },
              });
          }}
        >
          <option value="asc">{t.ascending}</option>
          <option value="desc">{t.descending}</option>
        </NativeSelect>
      ) : null}
    </>
  );
}
