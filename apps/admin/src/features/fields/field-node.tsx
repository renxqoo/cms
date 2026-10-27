'use client';

import { fieldWidthStyle } from './field-layout';
import { Field } from '@new-cms/ui/forms';
import {
  ConfiguredField,
  FieldLabel,
  FieldError,
  FieldControlSlot,
  FieldSlot,
} from './configured-field';
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
  RadioField,
  SingleSelectField,
  TextField,
} from './scalar-fields';
import { MultipleSelectField } from './select-field';
import type { ScalarProps } from './scalar-fields';
import type { FieldLocation } from './types';
import { RichTextField } from './rich-text-field';
import { SlugField } from './slug-field';
import { PrimitiveArrayField } from './primitive-array-field';

function ScalarControl(props: ScalarProps) {
  const { type, constraints } = props.node;
  if (type === 'slug') return <SlugField {...props} />;
  if (type === 'number') return <NumberField {...props} />;
  if (type === 'boolean') return <BooleanField {...props} />;
  if (type === 'radio') return <RadioField {...props} />;
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
  const { node, location } = props;
  const field = useFieldValue(location);
  return (
    <Field
      id={`${field.idPrefix}-${location.path.map(String).join('-')}`}
      label={
        <>
          <FieldLabel {...props} />
          {node.required && !field.enforceRequired ? (
            <span className="text-destructive"> *</span>
          ) : null}
        </>
      }
      name={location.path.map(String).join('.')}
      required={field.enforceRequired === true && node.required}
      description={
        <>
          <FieldSlot {...props} slot="Description">
            {node.description}
          </FieldSlot>
          <FieldNote {...props} />
        </>
      }
      error={field.error}
      renderError={(error) => <FieldError {...props} error={error} />}
    >
      <FieldControlSlot {...props}>
        <ScalarControl {...props} />
      </FieldControlSlot>
    </Field>
  );
}

function AdvancedField(props: ScalarProps) {
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
    </div>
  );
}

function JoinField(props: ScalarProps & { sourceReadOnly: boolean }) {
  const field = useFieldValue(props.location);
  const control = field.services.renderJoin?.({
    ...props,
    readOnly: props.sourceReadOnly,
    active: field.active !== false,
  });
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-sm font-medium">
        <FieldLabel {...props} /> · {field.t.readonly}
      </legend>
      {control ?? (
        <pre tabIndex={0} className="max-h-64 overflow-auto rounded-lg border p-3 text-xs">
          {JSON.stringify(field.value ?? null, null, 2)}
        </pre>
      )}
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
  const location = nodeLocation(node, parent);
  const adminReadOnly = location.adminReadOnly === true;
  const field = useFieldValue(location);
  const forcedReadOnly = forcedAccess(node, {
    inheritedReadOnly,
    pageReadOnly: field.readOnly === true,
  });
  const readOnly = forcedReadOnly || adminReadOnly;
  const props = { node, location, readOnly };
  const hidden =
    node.disabled?.field === true ||
    field.visibility?.[`${location.sourcePath}#${node.id}`] === false;
  const choices = field.choiceOptions?.[`${location.sourcePath}#${node.id}`];
  const configured = {
    ...props,
    node: choices ? { ...node, constraints: { ...node.constraints, options: choices } } : node,
    readOnly: readOnly || hidden,
  };
  if (node.hidden) return null;
  const descendants: RenderChildren = (children, at) =>
    renderChildren(children, { ...at, adminReadOnly }, forcedReadOnly);
  return (
    <div
      hidden={hidden}
      inert={hidden}
      style={fieldWidthStyle(node.width)}
      className="min-w-0 max-w-full basis-full px-2 md:basis-[var(--field-width,100%)]"
    >
      <ConfiguredField {...configured}>
        <FieldControl
          {...configured}
          sourceReadOnly={inheritedReadOnly || field.readOnly === true || adminReadOnly || hidden}
          renderChildren={descendants}
        />
      </ConfiguredField>
    </div>
  );
}

function nodeLocation(node: EditorNode, parent: FieldLocation): FieldLocation {
  return {
    adminReadOnly: node.readOnly ?? parent.adminReadOnly ?? false,
    path: node.name ? [...parent.path, node.name] : parent.path,
    identity: `${parent.identity}/${node.id}`,
    sourcePath: node.name
      ? [parent.sourcePath, node.name].filter(Boolean).join('.')
      : parent.sourcePath,
  };
}
function forcedAccess(
  node: EditorNode,
  input: { inheritedReadOnly: boolean; pageReadOnly: boolean },
): boolean {
  return (
    input.inheritedReadOnly ||
    input.pageReadOnly ||
    (node.type !== 'ui' && node.write === 'denied') ||
    node.type === 'join'
  );
}

function FieldControl(
  props: ScalarProps & { renderChildren: RenderChildren; sourceReadOnly: boolean },
) {
  const { node, renderChildren } = props;
  const field = useFieldValue(props.location);
  if (node.type === 'ui') return null;
  const control = field.renderControl?.(props);
  if (control !== undefined) return control;
  if (['group', 'row', 'collapsible'].includes(node.type))
    return <ContainerField {...props} renderChildren={renderChildren} />;
  if (node.type === 'tabs') return <TabsField {...props} renderChildren={renderChildren} />;
  if (node.type === 'array' || node.type === 'blocks')
    return <ArrayField {...props} renderChildren={renderChildren} />;
  if (node.constraints.hasMany && ['text', 'number'].includes(node.type))
    return <PrimitiveArrayField {...props} />;
  if (node.type === 'richText') return <RichTextField {...props} />;
  if (['relationship', 'upload', 'code', 'json'].includes(node.type))
    return <AdvancedField {...props} />;
  if (node.type === 'join') return <JoinField {...props} />;
  return <ScalarField {...props} />;
}
