'use client';

import { Component } from 'react';
import { ScopedField } from './scoped-field';
import type { ReactNode } from 'react';
import { Button } from '@new-cms/ui/actions';
import { useShell } from '../../components/shell/shell-provider';
import { useAdminComponents } from './registry';
import type { AdminComponentReference } from '../../contracts/admin-components';
import { componentPresentation, componentReferences } from './component-reference';
import { componentValue } from './component-value';
import type {
  FieldComponentProps,
  FieldComponentSlot,
  CellComponentProps,
  CollectionComponentProps,
  CollectionComponentSlot,
} from './types';

class ComponentBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; error: string; retry: string },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <>
        <span role="alert" className="block text-sm text-destructive">
          {this.props.error}{' '}
          <Button variant="ghost" size="sm" onClick={() => this.setState({ failed: false })}>
            {this.props.retry}
          </Button>
        </span>
        {this.props.fallback}
      </>
    );
  }
}

function RegisteredComponent({
  children,
  fallback,
  missing,
}: {
  children: ReactNode;
  fallback: ReactNode;
  missing: boolean;
}) {
  const language = useShell((state) => state.locale);
  const error = language === 'zh' ? '自定义组件暂时不可用' : 'The custom component is unavailable';
  if (missing)
    return (
      <>
        <span role="alert" className="block text-sm text-destructive">
          {error}
        </span>
        {fallback}
      </>
    );
  return (
    <ComponentBoundary
      fallback={fallback}
      error={error}
      retry={language === 'zh' ? '重试' : 'Retry'}
    >
      {children}
    </ComponentBoundary>
  );
}

export function RegisteredField({
  slot,
  component,
  componentProps,
  componentNamespace,
  instance,
  ...props
}: FieldComponentProps & {
  slot: FieldComponentSlot;
  component: AdminComponentReference | undefined;
  instance?: number;
}) {
  const registry = useAdminComponents();
  if (component === undefined) return props.children;
  if (component === false) return null;
  const reference = componentPresentation({
    reference: component,
    namespace: componentNamespace ?? `${props.name}#${props.node.id}`,
    slot,
    ...(instance === undefined ? {} : { instance }),
    props: componentProps,
  });
  if (!reference) return null;
  const configured = registry.fields[slot];
  const Custom =
    configured && Object.hasOwn(configured, reference.id) ? configured[reference.id] : undefined;
  return (
    <RegisteredComponent
      key={`${slot}:${reference.id}:${instance ?? ''}`}
      missing={!Custom || !reference.valid || !componentValue(registry.versions, reference.id)}
      fallback={props.children}
    >
      {Custom ? (
        <ScopedField
          {...props}
          component={Custom}
          identity={`${componentNamespace ?? props.name}:${slot}:${reference.id}:${instance ?? ''}`}
          customProps={reference.props}
        />
      ) : null}
    </RegisteredComponent>
  );
}

export function RegisteredCell(props: CellComponentProps) {
  const registry = useAdminComponents();
  const component = props.field.components?.Cell;
  if (component === undefined) return props.children;
  if (component === false) return null;
  const reference = componentPresentation({
    reference: component,
    namespace: `${props.field.path}#${props.field.id}`,
    slot: 'Cell',
    props: props.document.componentProps,
  });
  if (!reference) return null;
  const Custom = Object.hasOwn(registry.cells, reference.id)
    ? registry.cells[reference.id]
    : undefined;
  return (
    <RegisteredComponent
      key={reference.id}
      missing={
        !Custom ||
        !reference.valid ||
        !componentValue(props.collection.componentVersions, reference.id) ||
        componentValue(registry.versions, reference.id) !==
          componentValue(props.collection.componentVersions, reference.id)
      }
      fallback={props.children}
    >
      {Custom ? <Custom {...props} customProps={reference.props} /> : null}
    </RegisteredComponent>
  );
}

export function RegisteredCollection({
  slot,
  component,
  namespace = '$collection',
  ...props
}: CollectionComponentProps & {
  slot: CollectionComponentSlot;
  component?: AdminComponentReference | readonly AdminComponentReference[];
  namespace?: string;
}) {
  const registry = useAdminComponents();
  const value = component ?? props.collection.admin?.components?.[slot];
  if (value === undefined) return props.children;
  if (value === false) return null;
  const versions = props.editor?.componentVersions ?? props.collection.componentVersions;
  return (
    <>
      {componentReferences(value).map((entry, index) => {
        const reference = componentPresentation({
          reference: entry,
          namespace,
          slot,
          ...(Array.isArray(value) ? { instance: index } : {}),
          props: props.editor?.componentProps ?? props.collection.componentProps,
        });
        if (!reference) return null;
        const configured = registry.collections[slot];
        const Custom =
          configured && Object.hasOwn(configured, reference.id)
            ? configured[reference.id]
            : undefined;
        return (
          <RegisteredComponent
            key={`${slot}:${reference.id}:${index}`}
            missing={
              !Custom ||
              !reference.valid ||
              !componentValue(versions, reference.id) ||
              componentValue(registry.versions, reference.id) !==
                componentValue(versions, reference.id)
            }
            fallback={props.children}
          >
            {Custom ? <Custom {...props} customProps={reference.props} /> : null}
          </RegisteredComponent>
        );
      })}
    </>
  );
}
