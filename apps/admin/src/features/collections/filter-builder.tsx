'use client';

import { FieldFilter } from './field-customization';

import { filterFields } from './author-metadata';

import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Field, Input, NativeSelect } from '@new-cms/ui/forms';
import { Banner } from '@new-cms/ui/feedback';
import type { Collection } from '../../contracts/content';
import { useShell } from '../../components/shell/shell-provider';
import { draftFilter, filterFromDraft, filterOperators, validateFilter } from './query-filter';
import type { FilterDraft, FilterWhere } from './query-filter';
import { queryMessages } from './query-messages';
import type { QueryMessages } from './query-messages';
import type { ContentMessages } from './messages';

export function FilterBuilder({
  collection,
  value,
  t,
  onApply,
}: {
  collection: Collection;
  value: FilterWhere | undefined;
  t: ContentMessages;
  onApply: (value?: FilterWhere) => void;
}) {
  const locale = useShell((state) => state.locale);
  const labels = queryMessages[locale];
  const initial = draftFilter(value);
  const [draft, setDraft] = useState<FilterDraft>(
    initial.kind === 'group' ? initial : { kind: 'group', join: 'and', children: [initial] },
  );
  const [invalid, setInvalid] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
          const next = filterFromDraft(draft, collection);
          if (next && !validateFilter(next, collection)) throw new Error('Invalid filter');
          setInvalid(false);
          onApply(next);
        } catch {
          setInvalid(true);
        }
      }}
    >
      <FilterNode
        collection={collection}
        node={draft}
        path="filter"
        depth={1}
        t={t}
        labels={labels}
        onChange={setDraft}
      />
      {invalid ? <Banner tone="warning">{labels.invalid}</Banner> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="outline">
          {t.apply}
        </Button>
        {value ? (
          <Button variant="ghost" onClick={() => onApply()}>
            {t.clearFilter}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function FilterCondition({
  collection,
  node,
  path,
  t,
  labels,
  onChange,
}: {
  collection: Collection;
  node: FilterDraft;
  path: string;
  depth: number;
  t: ContentMessages;
  labels: QueryMessages;
  onChange: (node: FilterDraft) => void;
}) {
  if (node.kind !== 'condition') return null;
  const field = filterFields(collection).find((candidate) => candidate.path === node.field);
  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-3">
      <Field id={`${path}-field`} label={t.filterField}>
        <NativeSelect
          value={node.field}
          onChange={(event) => {
            const next = filterFields(collection).find(
              (candidate) => candidate.path === event.currentTarget.value,
            );
            onChange({
              ...node,
              field: event.currentTarget.value,
              operator: filterOperators(next)[0] ?? 'eq',
              value: '',
            });
          }}
        >
          <option value="">{t.noFilter}</option>
          {filterFields(collection)
            .filter(
              (candidate) =>
                candidate.queryable &&
                (!candidate.disabled?.filter || candidate.path === node.field),
            )
            .map((candidate) => (
              <option
                key={candidate.path}
                value={candidate.path}
                disabled={candidate.disabled?.filter}
              >
                {candidate.label}
              </option>
            ))}
        </NativeSelect>
      </Field>
      <Field id={`${path}-operator`} label={labels.operator}>
        <NativeSelect
          value={node.operator}
          onChange={(event) => {
            const operator = filterOperators(field).find(
              (entry) => entry === event.currentTarget.value,
            );
            if (operator) onChange({ ...node, operator });
          }}
        >
          {filterOperators(field).map((operator) => (
            <option key={operator} value={operator}>
              {labels.operators[operator]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <FieldFilter collection={collection} field={field} draft={node} onChange={onChange}>
        <Field id={`${path}-value`} label={t.filterValue}>
          <Input
            value={node.value}
            onChange={(event) => onChange({ ...node, value: event.currentTarget.value })}
          />
        </Field>
      </FieldFilter>
    </div>
  );
}

function FilterNode({
  collection,
  node,
  path,
  depth,
  t,
  labels,
  onChange,
}: {
  collection: Collection;
  node: FilterDraft;
  path: string;
  depth: number;
  t: ContentMessages;
  labels: QueryMessages;
  onChange: (node: FilterDraft) => void;
}) {
  if (node.kind === 'condition')
    return (
      <FilterCondition
        collection={collection}
        node={node}
        path={path}
        depth={depth}
        t={t}
        labels={labels}
        onChange={onChange}
      />
    );
  return (
    <fieldset className="min-w-0 space-y-3 rounded-md border p-3">
      <legend className="px-1 text-sm">{depth === 1 ? t.filters : labels.group}</legend>
      <NativeSelect
        aria-label={`${labels.operator} ${path}`}
        value={node.join}
        onChange={(event) =>
          onChange({ ...node, join: event.currentTarget.value === 'or' ? 'or' : 'and' })
        }
      >
        <option value="and">{labels.and}</option>
        <option value="or">{labels.or}</option>
      </NativeSelect>
      {node.children.map((child, index) => (
        <div key={index} className="min-w-0 space-y-2">
          <FilterNode
            collection={collection}
            node={child}
            path={`${path}-${index}`}
            depth={depth + 1}
            t={t}
            labels={labels}
            onChange={(next) =>
              onChange({
                ...node,
                children: node.children.map((current, position) =>
                  position === index ? next : current,
                ),
              })
            }
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              onChange({
                ...node,
                children: node.children.filter((_, position) => position !== index),
              })
            }
          >
            {labels.remove}
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={node.children.length >= 20}
          onClick={() =>
            onChange({
              ...node,
              children: [
                ...node.children,
                { kind: 'condition', field: '', operator: 'eq', value: '' },
              ],
            })
          }
        >
          {labels.add}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={depth >= 7 || node.children.length >= 20}
          onClick={() =>
            onChange({
              ...node,
              children: [...node.children, { kind: 'group', join: 'or', children: [] }],
            })
          }
        >
          {labels.group}
        </Button>
      </div>
    </fieldset>
  );
}
