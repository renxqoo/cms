'use client';

import { componentReferences, componentId } from '../admin-components/component-reference';

import type { ReactNode } from 'react';
import { Field } from '@new-cms/ui/forms';
import { RegisteredField } from '../admin-components/renderers';
import type { FieldComponentProps } from '../admin-components/types';
import { useFields, useFieldValue } from './field-context';
import type { FieldData } from './types';
import type { AdminComponentReference } from '../../contracts/admin-components';
import type { ScalarProps } from './scalar-fields';

export function useComponentProps(props: ScalarProps): FieldComponentProps {
  const field = useFieldValue(props.location);
  const { value: data } = useFields();
  return {
    ...(field.renderFields ? { renderFields: field.renderFields } : {}),
    node: props.node,
    id: `${field.idPrefix}-${props.location.path.map(String).join('-')}`,
    name: props.location.path.map(String).join('.'),
    value: field.value,
    data,
    componentNamespace: `${props.location.sourcePath}#${props.node.id}`,
    ...(field.componentProps ? { componentProps: field.componentProps } : {}),
    locale: field.locale,
    readOnly: props.readOnly,
    error: field.error,
    onValidityChange: field.onValidityChange,
    onChange: (value) => {
      if (!props.readOnly && props.node.type !== 'ui') field.change(value);
    },
  };
}

export function FieldSlot({
  slot,
  children,
  ...props
}: ScalarProps & { slot: 'Label' | 'Description' | 'Error'; children?: ReactNode }) {
  return (
    <RegisteredField
      {...useComponentProps(props)}
      slot={slot}
      component={props.node.components?.[slot]}
    >
      {children}
    </RegisteredField>
  );
}

export function FieldLabel(props: ScalarProps) {
  return (
    <FieldSlot {...props} slot="Label">
      {props.node.label}
    </FieldSlot>
  );
}

export function FieldError({ error, ...props }: ScalarProps & { error: string | undefined }) {
  const component = useComponentProps(props);
  if (!error) return null;
  return (
    <RegisteredField
      {...component}
      error={error}
      slot="Error"
      component={props.node.components?.Error}
    >
      {error}
    </RegisteredField>
  );
}

export function FieldControlSlot({ children, ...props }: ScalarProps & { children: ReactNode }) {
  return (
    <RegisteredField
      {...useComponentProps(props)}
      slot="Field"
      component={props.node.components?.Field}
    >
      {children}
    </RegisteredField>
  );
}

function Inputs({
  slot,
  props,
  component,
}: {
  slot: 'beforeInput' | 'afterInput';
  props: ScalarProps;
  component: FieldComponentProps;
}) {
  return (
    <>
      {componentReferences(props.node.components?.[slot]).map((reference, index) => (
        <RegisteredField
          key={`${slot}:${componentId(reference) ?? index}:${index}`}
          {...component}
          slot={slot}
          instance={index}
          component={reference}
        />
      ))}
    </>
  );
}

function scalar(type: string): boolean {
  return ![
    'group',
    'row',
    'collapsible',
    'tabs',
    'array',
    'blocks',
    'richText',
    'relationship',
    'upload',
    'code',
    'json',
    'join',
    'ui',
  ].includes(type);
}

function hasDescription(props: ScalarProps) {
  return props.node.components?.Description !== undefined || props.node.description !== undefined;
}

export function ConfiguredField({ children, ...props }: ScalarProps & { children: ReactNode }) {
  const component = useComponentProps(props);
  const customControl = !scalar(props.node.type) && Boolean(props.node.components?.Field);
  const content =
    props.node.type === 'ui' ? (
      <>
        {props.node.components?.Label !== undefined ? <FieldLabel {...props} /> : null}
        <FieldControlSlot {...props}>{children}</FieldControlSlot>
      </>
    ) : customControl ? (
      <Field
        id={component.id}
        name={component.name}
        label={<FieldLabel {...props} />}
        error={component.error}
        description={
          <FieldSlot {...props} slot="Description">
            {props.node.description}
          </FieldSlot>
        }
        renderError={(error) => <FieldError {...props} error={error} />}
      >
        <FieldControlSlot {...props}>{children}</FieldControlSlot>
      </Field>
    ) : (
      children
    );
  return (
    <>
      <Inputs slot="beforeInput" props={props} component={component} />
      {content}
      {!scalar(props.node.type) && !customControl && hasDescription(props) ? (
        <div className="text-sm text-muted-foreground">
          <RegisteredField
            {...component}
            slot="Description"
            component={props.node.components?.Description}
          >
            {props.node.description}
          </RegisteredField>
        </div>
      ) : null}
      {!scalar(props.node.type) && !customControl && component.error ? (
        <p role="alert" className="text-sm text-destructive">
          <FieldError {...props} error={component.error} />
        </p>
      ) : null}
      <Inputs slot="afterInput" props={props} component={component} />
    </>
  );
}

export function FieldRowSlot({
  row,
  index,
  slot,
  component,
  blockId,
  children,
  ...props
}: ScalarProps & {
  row: FieldData;
  index: number;
  slot: 'RowLabel' | 'Label' | 'Block';
  component: AdminComponentReference | undefined;
  blockId?: string;
  children?: ReactNode;
}) {
  const rowId = typeof row['id'] === 'string' ? row['id'] : '';
  const location = {
    path: [...props.location.path, index],
    identity: `${props.location.identity}/${rowId}`,
    sourcePath: `${props.location.sourcePath}.${rowId}`,
  };
  const configured = useComponentProps({
    ...props,
    location,
    node: blockId ? { ...props.node, id: blockId } : props.node,
  });
  return (
    <RegisteredField {...configured} slot={slot} component={component} row={row} rowIndex={index}>
      {children}
    </RegisteredField>
  );
}
