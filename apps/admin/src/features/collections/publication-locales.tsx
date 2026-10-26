'use client';

import { Field } from '@new-cms/ui/forms';
import { MultipleSelectField } from '../fields/select-field';
import type { ScalarProps } from '../fields/scalar-fields';
import { useFieldValue } from '../fields/field-context';
import type { contentMessages } from './messages';

export function PublicationLocalesField({
  locales,
  t,
  ...props
}: ScalarProps & { locales: readonly string[]; t: (typeof contentMessages)['en' | 'zh'] }) {
  const field = useFieldValue(props.location);
  return (
    <Field
      id={`${field.idPrefix}-publication-locales`}
      label={t.publicationLocales}
      description={t.publicationLocalesHint}
      error={field.error}
    >
      <MultipleSelectField
        {...props}
        node={{
          ...props.node,
          type: 'select',
          label: t.publicationLocales,
          constraints: { ...props.node.constraints, hasMany: true, options: [...locales] },
        }}
      />
    </Field>
  );
}
