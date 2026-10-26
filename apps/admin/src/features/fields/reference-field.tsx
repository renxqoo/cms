'use client';

import { useFieldValue } from './field-context';
import { fieldReferences, ReferenceControl } from './reference-control';
import type { ScalarProps } from './scalar-fields';

export function ReferenceField({ node, location, readOnly }: ScalarProps) {
  const field = useFieldValue(location);
  return (
    <ReferenceControl
      label={node.label}
      collectionKeys={node.constraints.relationTo ?? []}
      value={fieldReferences(field.value)}
      onChange={(values) =>
        field.change(
          node.constraints.hasMany
            ? values.map((value) => ({ ...value }))
            : values[0]
              ? { ...values[0] }
              : null,
        )
      }
      multiple={node.constraints.hasMany === true}
      readOnly={readOnly}
      renderMediaPreviews={node.type === 'upload'}
      path={location.path}
      sourcePath={location.sourcePath}
    />
  );
}
