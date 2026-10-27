'use client';

import { Checkbox, NativeSelect, Textarea } from '@new-cms/ui/forms';
import { useShell } from '../../components/shell/shell-provider';
import { useFields } from '../fields/field-context';
import { isFieldData, fieldValue } from '../fields/data';
import type { FieldComponentProps } from './types';
import { ModelJsonField } from './model-json-field';
import { ModelBindingsField } from './model-bindings-field';

function ModelLocales(props: FieldComponentProps) {
  const { services } = useFields();
  const values = Array.isArray(props.value)
    ? props.value.filter((value): value is string => typeof value === 'string')
    : [];
  const available =
    services.collections.find((collection) => collection.id === 'models')?.locales ?? [];
  return (
    <div className="flex flex-wrap gap-4">
      {[...new Set([...available, ...values])].map((locale) => (
        <Checkbox
          key={locale}
          label={locale}
          checked={values.includes(locale)}
          disabled={props.readOnly}
          onCheckedChange={(checked) => {
            if (!props.readOnly)
              props.onChange(
                checked ? [...values, locale] : values.filter((value) => value !== locale),
              );
          }}
        />
      ))}
    </div>
  );
}

function ModelKey(props: FieldComponentProps) {
  const zh = useShell((state) => state.locale) === 'zh';
  const path = props.name.split('.').map((part) => (/^\d+$/u.test(part) ? Number(part) : part));
  const parent = fieldValue(props.data, path.slice(0, -1));
  const target =
    props.customProps?.['kind'] === 'bindingKey'
      ? props.data['apiBindings']
      : isFieldData(parent)
        ? parent['scenarios']
        : [];
  const rows = Array.isArray(target) ? target.filter(isFieldData) : [];
  const value = typeof props.value === 'string' ? props.value : '';
  const keys = rows.flatMap((row) =>
    typeof row['key'] === 'string' && row['key'] ? [row['key']] : [],
  );
  return (
    <NativeSelect
      disabled={props.readOnly}
      value={value}
      onChange={(event) => props.onChange(event.currentTarget.value || null)}
    >
      <option value="">{zh ? '未选择' : 'Not selected'}</option>
      {value && !keys.includes(value) ? (
        <option value={value}>
          {value} ({zh ? '已失效' : 'missing'})
        </option>
      ) : null}
      {rows.map((row, index) =>
        typeof row['key'] === 'string' && row['key'] ? (
          <option key={`${row['key']}:${index}`} value={row['key']}>
            {typeof row['title'] === 'string' ? `${row['title']} (${row['key']})` : row['key']}
          </option>
        ) : null,
      )}
    </NativeSelect>
  );
}

export function ModelField(props: FieldComponentProps) {
  const kind = props.customProps?.['kind'];
  if (kind === 'locales') return <ModelLocales {...props} />;
  if (kind === 'bindings') return <ModelBindingsField {...props} />;
  if (kind === 'bindingKey' || kind === 'scenarioKey') return <ModelKey {...props} />;
  if (kind === 'multiline')
    return (
      <Textarea
        value={typeof props.value === 'string' ? props.value : ''}
        readOnly={props.readOnly}
        maxLength={props.node.constraints.maxLength}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
    );
  return <ModelJsonField {...props} />;
}
