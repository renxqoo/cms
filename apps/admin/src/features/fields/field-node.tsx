'use client';

import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Field } from '@new-cms/ui/forms';
import type { EditorNode } from '../../contracts/editor';
import { ArrayField } from './array-field';
import { EditorField } from './editor-field';
import { useFieldValue } from './field-context';
import type { RenderChildren } from './field-context';
import { ContainerField, TabsField } from './layout-fields';
import { PointField } from './point-field';
import { ReferenceField } from './reference-field';
import {
  BooleanField,
  DateField,
  NumberField,
  SingleSelectField,
  TextField,
} from './scalar-fields';
import { MultipleSelectField } from './select-field';
import type { ScalarProps } from './scalar-fields';
import type { FieldLocation } from './types';
import { RichTextField } from './rich-text-field';

function ScalarControl(props: ScalarProps) {
  const { type, constraints } = props.node;
  if (type === 'number') return <NumberField {...props} />;
  if (type === 'boolean') return <BooleanField {...props} />;
  if (type === 'date') return <DateField {...props} />;
  if (type === 'point') return <PointField {...props} />;
  if (type === 'select')
    return constraints.hasMany ? (
      <MultipleSelectField {...props} />
    ) : (
      <SingleSelectField {...props} />
    );
  return <TextField {...props} />;
}

function FieldNote({ node, location }: ScalarProps) {
  const field = useFieldValue(location);
  return (
    <>
      {node.localized ? (
        <span>
          {field.t.localized}: {field.locale}
        </span>
      ) : null}
      {node.write === 'conditional' ? <span className="block">{field.t.conditional}</span> : null}
    </>
  );
}

function ScalarField(props: ScalarProps) {
  const { node, location, readOnly } = props;
  const field = useFieldValue(location);
  const [clearEpoch, setClearEpoch] = useState(0);
  function clear() {
    field.onValidityChange(location.identity, null);
    field.change(null);
    setClearEpoch((before) => before + 1);
  }
  return (
    <Field
      id={`${field.idPrefix}-${location.path.map(String).join('-')}`}
      label={
        <>
          {node.label}
          {node.required && !field.enforceRequired ? (
            <span className="text-destructive"> *</span>
          ) : null}
        </>
      }
      name={location.path.map(String).join('.')}
      required={field.enforceRequired === true && node.required}
      description={<FieldNote {...props} />}
      error={field.error}
    >
      <ScalarControl key={clearEpoch} {...props} />
      {!readOnly && field.value !== null && field.value !== undefined ? (
        <Button variant="ghost" size="xs" className="w-fit" onClick={clear}>
          {field.t.clear}
        </Button>
      ) : null}
    </Field>
  );
}

function AdvancedField(props: ScalarProps) {
  const field = useFieldValue(props.location);
  return (
    <div className="space-y-2">
      {props.node.type === 'relationship' || props.node.type === 'upload' ? (
        <ReferenceField {...props} />
      ) : (
        <EditorField {...props} />
      )}
      <p className="text-xs text-muted-foreground">
        <FieldNote {...props} />
      </p>
      {field.error ? (
        <p role="alert" className="text-sm text-destructive">
          {field.error}
        </p>
      ) : null}
    </div>
  );
}

function JoinField(props: ScalarProps) {
  const field = useFieldValue(props.location);
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-sm font-medium">
        {props.node.label} · {field.t.readonly}
      </legend>
      <pre tabIndex={0} className="max-h-64 overflow-auto rounded-lg border p-3 text-xs">
        {JSON.stringify(field.value ?? null, null, 2)}
      </pre>
    </fieldset>
  );
}

export function FieldNode({
  node,
  parent,
  inheritedReadOnly,
  renderChildren,
}: {
  node: EditorNode;
  parent: FieldLocation;
  inheritedReadOnly: boolean;
  renderChildren: RenderChildren;
}) {
  const location = {
    path: node.name ? [...parent.path, node.name] : parent.path,
    identity: `${parent.identity}/${node.id}`,
    sourcePath: node.name
      ? [parent.sourcePath, node.name].filter(Boolean).join('.')
      : parent.sourcePath,
  };
  const field = useFieldValue(location);
  const readOnly =
    inheritedReadOnly || field.readOnly === true || node.write === 'denied' || node.type === 'join';
  const props = { node, location, readOnly };
  if (['group', 'row', 'collapsible'].includes(node.type))
    return <ContainerField {...props} renderChildren={renderChildren} />;
  if (node.type === 'tabs') return <TabsField {...props} renderChildren={renderChildren} />;
  if (node.type === 'array' || node.type === 'blocks')
    return <ArrayField {...props} renderChildren={renderChildren} />;
  if (node.type === 'richText') return <RichTextField {...props} />;
  if (['relationship', 'upload', 'code', 'json'].includes(node.type))
    return <AdvancedField {...props} />;
  if (node.type === 'join') return <JoinField {...props} />;
  return <ScalarField {...props} />;
}
