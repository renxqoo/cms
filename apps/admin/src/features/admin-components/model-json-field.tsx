'use client';

import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { useShell } from '../../components/shell/shell-provider';
import { equalFieldValue, isFieldData } from '../fields/data';
import { initializeFieldData } from '../fields/initialize-data';
import type { FieldComponentProps } from './types';
import { jsonLayout, requestData } from './model-json-layout';
import type { FieldData } from '../fields/types';
import { FieldsProvider, useFields } from '../fields/field-context';

export function ModelJsonField(props: FieldComponentProps) {
  const zh = useShell((state) => state.locale) === 'zh';
  const kind = props.customProps?.['kind'];
  const layout = jsonLayout(props, zh);
  const fields = useFields();
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [invalid, setInvalid] = useState<Readonly<Record<string, string>>>({});
  function validity(key: string, error: string | null) {
    setInvalid((before) => {
      if (before[key] === (error ?? undefined)) return before;
      if (error !== null) return { ...before, [key]: error };
      return Object.fromEntries(Object.entries(before).filter(([name]) => name !== key));
    });
    props.onValidityChange?.(key, error);
  }
  const source =
    kind === 'strings' ? { items: props.value ?? [] } : isFieldData(props.value) ? props.value : {};
  const layoutKey = JSON.stringify(layout);
  const [state, setState] = useState(() => ({
    source,
    layoutKey,
    draft: initializeFieldData(layout, source, () => crypto.randomUUID()),
  }));
  if (!equalFieldValue(state.source, source) || state.layoutKey !== layoutKey)
    setState({
      source,
      layoutKey,
      draft: initializeFieldData(layout, source, () => crypto.randomUUID()),
    });
  function change(value: FieldData) {
    if (props.readOnly) return;
    const next =
      kind === 'request'
        ? requestData(layout, value)
        : kind === 'provenance'
          ? Object.fromEntries(
              Object.entries(value).filter(
                ([key, entry]) =>
                  !['sourceUrl', 'createdAt'].includes(key) || (entry !== null && entry !== ''),
              ),
            )
          : value;
    setState({ source: next, layoutKey, draft: value });
    props.onChange(kind === 'strings' ? (value['items'] ?? []) : next);
  }
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex gap-2" role="group" aria-label={zh ? '编辑方式' : 'Editor mode'}>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={mode === 'form'}
          disabled={mode === 'json' && Object.keys(invalid).length > 0}
          onClick={() => setMode('form')}
        >
          {zh ? '表单' : 'Form'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={mode === 'json'}
          disabled={mode === 'form' && Object.keys(invalid).length > 0}
          onClick={() => setMode('json')}
        >
          JSON
        </Button>
      </div>
      {mode === 'json' ? (
        <FieldsProvider value={{ ...fields, onValidityChange: validity }}>
          {props.children}
        </FieldsProvider>
      ) : layout.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {zh ? '请先选择接口协议和调用流程。' : 'Select an API profile and flow first.'}
        </p>
      ) : (
        props.renderFields?.({
          readOnly: props.readOnly,
          idPrefix: props.id,
          layout,
          value: state.draft,
          onChange: change,
          onValidityChange: validity,
          resetKey: `${props.id}:${JSON.stringify(layout)}`,
        })
      )}
    </div>
  );
}
