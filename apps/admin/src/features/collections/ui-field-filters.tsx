'use client';

import { useState } from 'react';
import { Banner } from '@new-cms/ui/feedback';
import { useShell } from '../../components/shell/shell-provider';
import { editorNodeSchema } from '../../contracts/editor';
import type { Collection } from '../../contracts/content';
import { RegisteredField } from '../admin-components/renderers';
import { queryFilter } from './query';
import type { DocumentQuery } from './query';
import { validateFilter } from './query-filter';
import { queryMessages } from './query-messages';
import type { JsonValue } from '../fields/types';

export function UiFieldFilters({
  collection,
  query,
  change,
}: {
  collection: Collection;
  query: DocumentQuery;
  change: (patch: Partial<DocumentQuery>) => void;
}) {
  const locale = useShell((state) => state.locale);
  const [invalid, setInvalid] = useState(false);
  const fields = collection.fields.filter(
    (field) =>
      field.type === 'ui' &&
      !field.disabled?.filter &&
      field.components?.Filter !== undefined &&
      field.components.Filter !== false,
  );
  const current = queryFilter(query, collection).where;
  if (fields.length === 0) return null;
  function apply(value: JsonValue) {
    if (value !== null && !validateFilter(value, collection)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    change({ where: value === null ? '' : JSON.stringify(value) });
  }
  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <RegisteredField
          key={field.id}
          slot="Filter"
          component={field.components?.Filter}
          node={editorNodeSchema.parse({
            id: field.id,
            name: field.path,
            path: field.path,
            type: 'ui',
            label: field.label,
            required: false,
            localized: false,
            write: 'denied',
            constraints: {},
          })}
          id={`ui-filter-${field.id}`}
          name={field.path}
          value={current ?? null}
          data={{}}
          locale={locale}
          readOnly={false}
          error={undefined}
          componentNamespace={`${field.path}#${field.id}`}
          {...(collection.componentProps ? { componentProps: collection.componentProps } : {})}
          onChange={apply}
        />
      ))}
      {invalid ? <Banner tone="warning">{queryMessages[locale].invalid}</Banner> : null}
    </div>
  );
}
