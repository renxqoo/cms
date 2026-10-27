'use client';

import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { NativeSelect } from '@new-cms/ui/forms';
import type { Collection } from '../../contracts/content';
import { useShell } from '../../components/shell/shell-provider';
import { queryMessages } from './query-messages';
import type { DocumentSort } from './query-filter';
import { orderingMessages } from './ordering-messages';

export function SortBuilder({
  collection,
  value,
  onApply,
}: {
  collection: Collection;
  value: DocumentSort[];
  onApply: (sort: DocumentSort[]) => void;
}) {
  const locale = useShell((state) => state.locale);
  const t = queryMessages[locale];
  const [sort, setSort] = useState(value);
  const fields = [
    ...(collection.orderable ? [{ path: '_order', label: orderingMessages[locale].order }] : []),
    ...collection.fields
      .filter((field) => field.queryable && field.sortable)
      .map((field) => ({ path: field.path, label: field.label })),
    ...['id', 'createdAt', 'updatedAt', 'revision'].map((path) => ({ path, label: path })),
  ];
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onApply(sort);
      }}
    >
      {sort.map((entry, index) => (
        <div key={entry.field} className="flex flex-wrap gap-2">
          <NativeSelect
            aria-label={`${t.sort} ${index + 1}`}
            value={entry.field}
            onChange={(event) =>
              setSort(
                sort.map((current, position) =>
                  position === index ? { ...current, field: event.currentTarget.value } : current,
                ),
              )
            }
          >
            {fields
              .filter(
                (field) =>
                  field.path === entry.field ||
                  !sort.some((current) => current.field === field.path),
              )
              .map((field) => (
                <option key={field.path} value={field.path}>
                  {field.label}
                </option>
              ))}
          </NativeSelect>
          <NativeSelect
            aria-label={`${t.operator} ${index + 1}`}
            value={entry.order}
            onChange={(event) =>
              setSort(
                sort.map((current, position) =>
                  position === index
                    ? { ...current, order: event.currentTarget.value === 'asc' ? 'asc' : 'desc' }
                    : current,
                ),
              )
            }
          >
            <option value="asc">{t.ascending}</option>
            <option value="desc">{t.descending}</option>
          </NativeSelect>
          <Button
            variant="ghost"
            disabled={index === 0}
            onClick={() =>
              setSort(
                sort.map((current, position) =>
                  position === index - 1
                    ? entry
                    : position === index
                      ? (sort[index - 1] ?? current)
                      : current,
                ),
              )
            }
          >
            {t.priority}
          </Button>
          <Button
            variant="ghost"
            disabled={sort.length === 1}
            onClick={() => setSort(sort.filter((_, position) => position !== index))}
          >
            {t.remove}
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        disabled={sort.length >= fields.length}
        onClick={() => {
          const next = fields.find((field) => !sort.some((entry) => entry.field === field.path));
          if (next) setSort([...sort, { field: next.path, order: 'asc' }]);
        }}
      >
        {t.addSort}
      </Button>
      <Button type="submit">{t.apply}</Button>
    </form>
  );
}
