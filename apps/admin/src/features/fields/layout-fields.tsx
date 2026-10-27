'use client';

import { useState } from 'react';
import { FieldLabel } from './configured-field';
import type { KeyboardEvent } from 'react';
import { Collapsible } from '@new-cms/ui/layout';
import { Button } from '@new-cms/ui/actions';
import type { ScalarProps } from './scalar-fields';
import type { RenderChildren } from './field-context';

export function ContainerField({
  node,
  location,
  readOnly,
  renderChildren,
}: ScalarProps & { renderChildren: RenderChildren }) {
  const [open, setOpen] = useState(true);
  const children = renderChildren(node.children ?? [], location, readOnly);
  if (node.type === 'row')
    return (
      <div className="min-w-0 space-y-4">
        {node.components?.Label ? (
          <p className="text-sm font-medium">
            <FieldLabel node={node} location={location} readOnly={readOnly} />
          </p>
        ) : null}
        {children}
      </div>
    );
  if (node.type === 'collapsible')
    return (
      <Collapsible
        title={<FieldLabel node={node} location={location} readOnly={readOnly} />}
        open={open}
        onOpenChange={setOpen}
        keepMounted
      >
        {children}
      </Collapsible>
    );
  return (
    <fieldset className="min-w-0 space-y-4 rounded-xl border border-border/60 p-4">
      <legend className="px-1 text-sm font-medium">
        <FieldLabel node={node} location={location} readOnly={readOnly} />
      </legend>
      {children}
    </fieldset>
  );
}

export function TabsField({
  node,
  location,
  readOnly,
  renderChildren,
}: ScalarProps & { renderChildren: RenderChildren }) {
  const tabs = node.tabs ?? [];
  const [selected, setSelected] = useState(tabs[0]?.id ?? '');
  const [activated, setActivated] = useState(() => new Set([tabs[0]?.id]));
  const current = tabs.find((tab) => tab.id === selected) ?? tabs[0];
  function choose(id: string) {
    setSelected(id);
    setActivated((before) => new Set([...before, id]));
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const position = tabs.findIndex((tab) => tab.id === current?.id);
    const offset = event.key === 'ArrowLeft' ? -1 : 1;
    const next =
      event.key === 'Home'
        ? tabs[0]
        : event.key === 'End'
          ? tabs.at(-1)
          : tabs[(position + offset + tabs.length) % tabs.length];
    if (!next) return;
    choose(next.id);
    event.currentTarget
      .querySelector<HTMLButtonElement>(`[data-tab-index="${tabs.indexOf(next)}"]`)
      ?.focus();
    event.preventDefault();
  }
  return (
    <section className="min-w-0 space-y-4" aria-label={node.label}>
      {node.components?.Label ? (
        <h3 className="text-sm font-medium">
          <FieldLabel node={node} location={location} readOnly={readOnly} />
        </h3>
      ) : null}
      <div
        role="tablist"
        aria-label={node.label}
        onKeyDown={keyboard}
        className="flex overflow-x-auto border-b border-border"
      >
        {tabs.map((tab, index) => (
          <Button
            key={tab.id}
            role="tab"
            id={`${location.identity}-${tab.id}-tab`}
            aria-controls={`${location.identity}-${tab.id}-panel`}
            aria-selected={current?.id === tab.id}
            tabIndex={current?.id === tab.id ? 0 : -1}
            data-tab-index={index}
            variant="ghost"
            className={`rounded-none border-b-2 px-4 ${current?.id === tab.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}
            onClick={() => choose(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${location.identity}-${tab.id}-panel`}
          aria-labelledby={`${location.identity}-${tab.id}-tab`}
          hidden={current?.id !== tab.id}
          className="space-y-4"
        >
          {activated.has(tab.id)
            ? renderChildren(
                tab.children,
                {
                  path: tab.name ? [...location.path, tab.name] : location.path,
                  identity: `${location.identity}/${tab.id}`,
                  sourcePath: tab.name
                    ? [location.sourcePath, tab.name].filter(Boolean).join('.')
                    : location.sourcePath,
                },
                readOnly,
              )
            : null}
        </div>
      ))}
    </section>
  );
}
