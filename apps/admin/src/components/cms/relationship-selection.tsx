'use client';

import type { ReactNode } from 'react';
import { Button } from '@new-cms/ui/actions';
import { SortableList, Thumbnail } from '@new-cms/ui/data';
import { relationshipKey, relationshipValues } from './relationship-types';
import type { RelationshipInputProps, RelationshipValue } from './relationship-types';
import { safeResourceUrl } from './safe-url';

function removeValue(props: RelationshipInputProps, removed: RelationshipValue) {
  if (props.mode === 'single') props.onChange(null);
  else
    props.onChange(
      props.value.filter((value) => relationshipKey(value) !== relationshipKey(removed)),
    );
}

function SelectedValue({
  props,
  value,
  handle,
}: {
  props: RelationshipInputProps;
  value: RelationshipValue;
  handle?: ReactNode;
}) {
  const option = props.options.find((item) => relationshipKey(item) === relationshipKey(value));
  const available =
    value.available !== false &&
    option?.available !== false &&
    props.collections.some((collection) => collection.id === value.collection) &&
    (props.loadOptions !== undefined || option !== undefined);
  const preview = safeResourceUrl(value.previewUrl ?? option?.previewUrl, true);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-input bg-background px-2.5 py-2 text-sm">
      {handle}
      {props.displayPreview ? (
        <Thumbnail
          src={preview}
          alt={value.label}
          filename={value.label}
          fallbackLabel={props.labels.unavailable}
        />
      ) : null}
      <span className="min-w-0 flex-1 break-words">{value.label}</span>
      {!available ? (
        <span className="text-xs text-destructive">{props.labels.unavailable}</span>
      ) : null}
      {!props.readOnly && props.onEdit ? (
        <Button
          size="xs"
          variant="ghost"
          aria-label={`${props.labels.edit} ${value.label}`}
          onClick={() => props.onEdit?.(value)}
        >
          {props.labels.edit}
        </Button>
      ) : null}
      {!props.readOnly ? (
        <Button
          size="xs"
          variant="ghost"
          aria-label={`${props.labels.remove} ${value.label}`}
          onClick={() => removeValue(props, value)}
        >
          {props.labels.remove}
        </Button>
      ) : null}
    </div>
  );
}

export function RelationshipSelection({ props }: { props: RelationshipInputProps }) {
  const values = relationshipValues(props);
  if (props.mode === 'multiple' && !props.readOnly && values.length > 1) {
    return (
      <SortableList
        items={values}
        getId={relationshipKey}
        getItemLabel={(value) => value.label}
        onChange={props.onChange}
        labels={props.labels.sorting}
        renderItem={(value, handle) => (
          <SelectedValue props={props} value={value} handle={handle} />
        )}
      />
    );
  }
  return (
    <div className="space-y-2">
      {values.map((value) => (
        <SelectedValue props={props} key={relationshipKey(value)} value={value} />
      ))}
    </div>
  );
}
