'use client';
import { useState } from 'react';
import { z } from 'zod';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { Input, NativeSelect } from '@new-cms/ui/forms';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@new-cms/ui/overlays';
import type { Collection } from '../../contracts/content';
import { validWhere } from './content-query';
import type { ContentWhere } from './content-query';
import type { ContentMessages } from './content-messages';
const operators = [
  'eq',
  'ne',
  'in',
  'notIn',
  'exists',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
] as const;
function condition(collection: Collection): ContentWhere {
  return {
    field: collection.fields.find((field) => field.queryable)?.path ?? 'id',
    operator: 'eq',
    value: '',
  };
}
export function ContentFilterDialog({
  collection,
  initial,
  onClose,
  onApply,
  messages: t,
}: {
  collection: Collection;
  initial: ContentWhere | undefined;
  onClose: () => void;
  onApply: (where?: ContentWhere) => void;
  messages: ContentMessages;
}) {
  const [value, setValue] = useState<ContentWhere>(initial ?? { and: [condition(collection)] });
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(new Set());
  function validity(id: string, valid: boolean) {
    setInvalid((current) => {
      const next = new Set(current);
      if (valid) {
        for (const key of next) if (key === id || key.startsWith(`${id}:`)) next.delete(key);
      } else next.add(id);
      return next;
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent closeLabel={t.close} className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t.filters}</DialogTitle>
        </DialogHeader>
        <WhereNode
          value={value}
          collection={collection}
          onChange={setValue}
          depth={0}
          identity="filter"
          validity={validity}
          messages={t}
        />
        {invalid.size > 0 || !validWhere(value, collection) ? (
          <Banner tone="error">{t.filterInvalid}</Banner>
        ) : null}
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              onApply();
              onClose();
            }}
          >
            {t.clearSearch}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            disabled={invalid.size > 0 || !validWhere(value, collection)}
            onClick={() => {
              onApply(value);
              onClose();
            }}
          >
            {t.apply}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
interface WhereProps {
  value: ContentWhere;
  collection: Collection;
  onChange: (value: ContentWhere) => void;
  depth: number;
  identity: string;
  validity: (id: string, valid: boolean) => void;
  messages: ContentMessages;
}
function WhereNode(props: WhereProps) {
  const { value, collection, onChange, identity, validity, messages: t } = props;
  if ('field' in value)
    return (
      <div className="grid gap-2 sm:grid-cols-[1fr_100px_1fr]">
        <NativeSelect
          aria-label={t.field}
          value={value.field}
          onChange={(event) => {
            validity(identity, true);
            onChange({ ...value, field: event.target.value, value: '' });
          }}
        >
          <option value="id">{t.id}</option>
          {collection.fields
            .filter((field) => field.queryable)
            .map((field) => (
              <option key={field.path} value={field.path}>
                {field.label}
              </option>
            ))}
        </NativeSelect>
        <NativeSelect
          aria-label={t.operator}
          value={value.operator}
          onChange={(event) => {
            const operator = operators.find((item) => item === event.target.value);
            if (operator) {
              validity(identity, true);
              onChange({ ...value, operator, value: operator === 'exists' ? true : '' });
            }
          }}
        >
          {operators.map((operator) => (
            <option key={operator} value={operator}>
              {operator}
            </option>
          ))}
        </NativeSelect>
        <FilterValue
          key={`${value.field}:${value.operator}`}
          node={value}
          type={collection.fields.find((field) => field.path === value.field)?.type ?? 'text'}
          onChange={(next) => onChange({ ...value, value: next })}
          identity={identity}
          validity={validity}
          messages={t}
        />
      </div>
    );
  return <WhereGroup {...props} value={value} />;
}
function WhereGroup({
  value,
  collection,
  onChange,
  depth,
  identity,
  validity,
  messages: t,
}: Omit<WhereProps, 'value'> & { value: Exclude<ContentWhere, { field: string }> }) {
  const nodes = 'and' in value ? value.and : value.or;
  const mode = 'and' in value ? 'and' : 'or';
  const [keys, setKeys] = useState(() => nodes.map(() => crypto.randomUUID()));
  function append(node: ContentWhere) {
    setKeys((current) => [...current, crypto.randomUUID()]);
    onChange(mode === 'and' ? { and: [...nodes, node] } : { or: [...nodes, node] });
  }
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <NativeSelect
        aria-label={t.operator}
        value={mode}
        onChange={(event) =>
          onChange(event.target.value === 'and' ? { and: nodes } : { or: nodes })
        }
      >
        <option value="and">AND</option>
        <option value="or">OR</option>
      </NativeSelect>
      {nodes.map((node, index) => (
        <div key={keys[index]} className="space-y-2">
          <WhereNode
            value={node}
            collection={collection}
            onChange={(next) =>
              onChange(
                mode === 'and'
                  ? { and: nodes.map((item, position) => (position === index ? next : item)) }
                  : { or: nodes.map((item, position) => (position === index ? next : item)) },
              )
            }
            depth={depth + 1}
            identity={`${identity}:${keys[index]}`}
            validity={validity}
            messages={t}
          />
          <Button
            size="xs"
            variant="ghost"
            disabled={nodes.length <= 1}
            onClick={() => {
              validity(`${identity}:${keys[index]}`, true);
              setKeys((current) => current.filter((_, position) => position !== index));
              const next = nodes.filter((_, position) => position !== index);
              onChange(mode === 'and' ? { and: next } : { or: next });
            }}
          >
            {t.removeFilter}
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={nodes.length >= 20}
          onClick={() => append(condition(collection))}
        >
          {t.addFilter}
        </Button>
        {depth < 5 ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              append(
                mode === 'and' ? { or: [condition(collection)] } : { and: [condition(collection)] },
              )
            }
          >
            AND / OR
          </Button>
        ) : null}
      </div>
    </div>
  );
}
function FilterValue({
  node,
  type,
  onChange,
  identity,
  validity,
  messages: t,
}: {
  node: Extract<ContentWhere, { field: string }>;
  type: string;
  onChange: (value: Extract<ContentWhere, { field: string }>['value']) => void;
  identity: string;
  validity: WhereProps['validity'];
  messages: ContentMessages;
}) {
  const structured =
    ['in', 'notIn'].includes(node.operator) ||
    ['json', 'point', 'relationship', 'upload'].includes(type);
  const [text, setText] = useState(
    typeof node.value === 'string' ? node.value : JSON.stringify(node.value),
  );
  function change(value: string) {
    setText(value);
    let parsed: unknown = value;
    try {
      if (structured) parsed = JSON.parse(value) as unknown;
      else if (type === 'number') {
        if (value.trim() === '') throw new Error('Empty number');
        parsed = Number(value);
        if (!Number.isFinite(parsed)) throw new Error('Invalid number');
      } else if (type === 'boolean' || node.operator === 'exists') {
        if (value !== 'true' && value !== 'false') throw new Error('Invalid boolean');
        parsed = value === 'true';
      }
      validity(identity, true);
      onChange(z.json().parse(parsed));
    } catch {
      validity(identity, false);
    }
  }
  return (
    <Input aria-label={t.value} value={text} onChange={(event) => change(event.target.value)} />
  );
}
