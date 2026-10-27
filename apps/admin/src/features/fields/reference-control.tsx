'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import type { ReactNode } from 'react';
import { Pagination } from '@new-cms/ui/data';
import { RelationshipInput } from '../../components/cms/relationship-input';
import type {
  RelationshipLabels,
  RelationshipOption,
  RelationshipQuery,
  RelationshipValue,
} from '../../components/cms/relationship-types';
import { relationshipKey } from '../../components/cms/relationship-types';
import { useReferenceEditor } from './reference-editor';
import { useFields } from './field-context';
import { fieldSorting } from './sorting';
import type { JsonValue, ReferencePage, ReferenceValue, FieldPath } from './types';

const reference = z.object({ collection: z.string(), id: z.uuid() });

export function fieldReferences(value: JsonValue | undefined) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return values.flatMap((entry) => {
    const parsed = reference.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

function selectedReferences(
  values: readonly ReferenceValue[],
  options: readonly RelationshipOption[],
  collections: readonly { id: string; label: string }[],
) {
  return values.map((value) => ({
    ...value,
    label:
      options.find((option) => relationshipKey(option) === relationshipKey(value))?.label ??
      `${collections.find((collection) => collection.id === value.collection)?.label ?? value.collection} / ${value.id}`,
  }));
}

export interface ReferenceControlProps {
  placeholder?: string;
  label: string;
  labelContent?: ReactNode;
  collectionKeys: readonly string[];
  value: readonly ReferenceValue[];
  onChange: (value: ReferenceValue[]) => void;
  multiple?: boolean;
  readOnly?: boolean;
  maxRows?: number;
  renderMediaPreviews?: boolean;
  path?: FieldPath;
  sourcePath?: string;
  filterOptions?: boolean;
  appearance?: 'select' | 'drawer';
  context?: 'admin';
}

export function ReferenceControl(props: ReferenceControlProps) {
  const field = useFields();
  const { readOnly = false } = props;
  const active = field.active !== false;
  const values = props.value;
  const latest = useRef(values);
  useEffect(() => {
    latest.current = values;
  }, [values]);
  const [paging, setPaging] = useState({ key: '', page: 1 });
  const [result, setResult] = useState<{ key: string; data: ReferencePage } | null>(null);
  const [options, setOptions] = useState<RelationshipOption[]>([]);
  const [waiting, setWaiting] = useState(false);
  const allowed = JSON.stringify(props.collectionKeys);
  const loadService = field.services.searchReferences;
  const { locale } = field;
  const { sourcePath = '', filterOptions = false, context } = props;
  const candidateKey = filterOptions
    ? JSON.stringify([field.services.referenceContextKey, field.value])
    : '';
  const load = useCallback(
    async (query: RelationshipQuery) => {
      const collections = z.array(z.string()).parse(JSON.parse(allowed));
      const collection = query.collection ?? (collections.length === 1 ? collections[0] : null);
      if (!collection) {
        setWaiting(true);
        setResult(null);
        return [];
      }
      if (!collections.includes(collection)) throw new Error('Invalid reference collection');
      const key = JSON.stringify([
        collection,
        query.query,
        candidateKey,
        locale,
        sourcePath,
        context,
      ]);
      const currentPage = key === paging.key ? paging.page : 1;
      setResult(null);
      const data = await loadService({
        collections,
        collection,
        query: query.query,
        page: currentPage,
        locale,
        sourcePath,
        filterOptions,
        ...(context ? { context } : {}),
        signal: query.signal,
      });
      if (query.signal.aborted) return [];
      if (
        data.page !== currentPage ||
        data.pageSize <= 0 ||
        data.total < data.rows.length ||
        data.rows.some((row) => row.collection !== collection)
      )
        throw new Error('Invalid reference page');
      setWaiting(false);
      setResult({ key, data });
      setOptions((before) => {
        const selected = new Set(latest.current.map(relationshipKey));
        const merged = new Map(
          before
            .filter((row) => selected.has(relationshipKey(row)))
            .map((row) => [relationshipKey(row), row]),
        );
        for (const row of data.rows) merged.set(relationshipKey(row), row);
        return [...merged.values()];
      });
      return data.rows;
    },
    [allowed, loadService, locale, paging, sourcePath, filterOptions, candidateKey, context],
  );
  const collections = props.collectionKeys.map((id) => ({
    id,
    label: field.services.collections.find((entry) => entry.id === id)?.label ?? id,
  }));
  const selected = selectedReferences(values, options, collections);
  const labels = referenceLabels(field.t, props.label, waiting);
  const pagination = result ? (
    <Pagination
      {...result.data}
      onPageChange={(page) => setPaging({ key: result.key, page })}
      previousLabel={field.t.previous}
      nextLabel={field.t.next}
      pageLabel={`${field.t.page} ${result.data.page}`}
      totalLabel={`${result.data.total} ${field.t.total}`}
    />
  ) : null;
  const editing = useReferenceEditor({
    collectionKeys: props.collectionKeys,
    value: props.value,
    onChange: props.onChange,
    onResolved: (rows) => setOptions((entries) => mergeReferenceOptions(entries, rows)),
    multiple: props.multiple === true,
    maxRows: props.maxRows ?? Number.MAX_SAFE_INTEGER,
    readOnly,
    active,
    locale,
    sourcePath,
    filterOptions,
    services: field.services,
  });
  const common = {
    ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }),
    label: props.label,
    labelContent: props.labelContent,
    collections,
    options,
    loadOptions: load,
    appearance: props.appearance ?? 'drawer',
    maxRows: props.maxRows ?? Number.MAX_SAFE_INTEGER,
    labels,
    readOnly: readOnly || !active,
    pagination,
    ...editing.ports,
  };
  function change(next: RelationshipValue | RelationshipValue[] | null) {
    if (Array.isArray(next)) props.onChange(next.map(({ collection, id }) => ({ collection, id })));
    else props.onChange(next ? [{ collection: next.collection, id: next.id }] : []);
  }
  return (
    <div className="space-y-3">
      {editing.element}
      {props.multiple ? (
        <RelationshipInput
          key={String(active)}
          {...common}
          mode="multiple"
          value={selected}
          onChange={change}
        />
      ) : (
        <RelationshipInput
          key={String(active)}
          {...common}
          mode="single"
          value={selected[0] ?? null}
          onChange={change}
        />
      )}
      <ReferenceMediaPreviews {...props} />
    </div>
  );
}

function referenceLabels(
  t: ReturnType<typeof useFields>['t'],
  label: string,
  waiting: boolean,
): RelationshipLabels {
  return {
    search: t.search,
    chooseExisting: t.choose,
    empty: waiting ? t.collection : t.empty,
    loading: t.loading,
    error: t.referenceError,
    retry: t.retry,
    clear: t.clear,
    remove: t.remove,
    unavailable: t.unavailable,
    maximum: t.maximum,
    create: t.create,
    edit: t.edit,
    moveUp: t.moveUp,
    moveDown: t.moveDown,
    close: t.close,
    collection: t.collection,
    sorting: fieldSorting(t, label),
  };
}

function mergeReferenceOptions(
  entries: RelationshipOption[],
  rows: RelationshipOption[],
): RelationshipOption[] {
  return [
    ...entries.filter(
      (entry) => !rows.some((row) => relationshipKey(row) === relationshipKey(entry)),
    ),
    ...rows,
  ];
}

function ReferenceMediaPreviews(
  props: Pick<
    ReferenceControlProps,
    'renderMediaPreviews' | 'value' | 'sourcePath' | 'multiple' | 'path'
  >,
) {
  const field = useFields();
  return (
    <>
      {props.renderMediaPreviews === true
        ? props.value.map((value, index) => (
            <div key={relationshipKey(value)}>
              {field.services.renderPreview?.({
                reference: value,
                sourcePath: `${field.locale}:${props.sourcePath ?? ''}${props.multiple ? `.${index}` : ''}`,
                path: props.multiple ? [...(props.path ?? []), index] : (props.path ?? []),
              })}
            </div>
          ))
        : null}
    </>
  );
}
