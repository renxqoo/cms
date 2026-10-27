'use client';

import { useShell } from '../../components/shell/shell-provider';
import { labelledOptions } from './option-labels';
import { Select } from '@new-cms/ui/forms';
import { useFieldValue } from './field-context';
import { fieldSorting } from './sorting';
import type { ScalarProps } from './scalar-fields';

export function MultipleSelectField({ node, location, readOnly }: ScalarProps) {
  const locale = useShell((shell) => shell.locale);
  const field = useFieldValue(location);
  const value = Array.isArray(field.value)
    ? field.value.filter((entry) => typeof entry === 'string')
    : [];
  return (
    <Select
      multiple
      value={value}
      onChange={field.change}
      label={node.label}
      options={labelledOptions(node.constraints.options ?? [], locale)}
      placeholder={node.placeholder ?? field.t.unset}
      emptyLabel={field.t.empty}
      loadingLabel={field.t.loading}
      errorLabel={field.t.referenceError}
      clearLabel={field.t.clear}
      removeLabel={(label) => `${field.t.remove} ${label}`}
      readOnly={readOnly}
      sorting={fieldSorting(field.t, node.label)}
    />
  );
}
