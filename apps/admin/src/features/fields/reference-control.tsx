'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Pagination } from '@new-cms/ui/data';
import { RelationshipInput } from '../../components/cms/relationship-input';
import type {
  RelationshipLabels,
  RelationshipOption,
  RelationshipQuery,
  RelationshipValue,
} from '../../components/cms/relationship-types';
import { relationshipKey } from '../../components/cms/relationship-types';
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

export interface ReferenceControlProps {
  label: string;
  collectionKeys: readonly string[];
  value: readonly ReferenceValue[];
  onChange: (value: ReferenceValue[]) => void;
  multiple?: boolean;
  readOnly?: boolean;
  maxRows?: number;
  renderMediaPreviews?: boolean;
  path?: FieldPath;
  sourcePath?: string;
  appearance?: 'select' | 'drawer';
}

export function ReferenceControl(props: ReferenceControlProps) {
  const field = useFields();
  const { readOnly = false } = props;
  const values = props.value;
  const latest = useRef(values);
  useEffect(() => {
    latest.current = values;
  }, [values]);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ReferencePage | null>(null);
  const [options, setOptions] = useState<RelationshipOption[]>([]);
  const [waiting, setWaiting] = useState(false);
  const previous = useRef('');
  const allowed = JSON.stringify(props.collectionKeys);
  const loadService = field.services.searchReferences;
  const { locale } = field;
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
      const key = JSON.stringify([collection, query.query]);
      const currentPage = key === previous.current ? page : 1;
      if (previous.current !== key) {
        previous.current = key;
        if (page !== 1) setPage(1);
      }
      const data = await loadService({
        collections,
        collection,
        query: query.query,
        page: currentPage,
        locale,
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
      setResult(data);
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
    [allowed, loadService, locale, page],
  );
  const collections = props.collectionKeys.map((id) => ({
    id,
    label: field.services.collections.find((entry) => entry.id === id)?.label ?? id,
  }));
  const selected = values.map((value) => ({
    ...value,
    label:
      options.find((option) => relationshipKey(option) === relationshipKey(value))?.label ??
      `${collections.find((collection) => collection.id === value.collection)?.label ?? value.collection} / ${value.id}`,
  }));
  const labels: RelationshipLabels = {
    search: field.t.search,
    chooseExisting: field.t.choose,
    empty: waiting ? field.t.collection : field.t.empty,
    loading: field.t.loading,
    error: field.t.referenceError,
    retry: field.t.retry,
    clear: field.t.clear,
    remove: field.t.remove,
    unavailable: field.t.unavailable,
    maximum: field.t.maximum,
    create: field.t.create,
    edit: field.t.edit,
    moveUp: field.t.moveUp,
    moveDown: field.t.moveDown,
    close: field.t.close,
    collection: field.t.collection,
    sorting: fieldSorting(field.t, props.label),
  };
  const pagination = result ? (
    <Pagination
      {...result}
      onPageChange={setPage}
      previousLabel={field.t.previous}
      nextLabel={field.t.next}
      pageLabel={`${field.t.page} ${result.page}`}
      totalLabel={`${result.total} ${field.t.total}`}
    />
  ) : null;
  const common = {
    label: props.label,
    collections,
    options,
    loadOptions: load,
    appearance: props.appearance ?? 'drawer',
    maxRows: props.maxRows ?? Number.MAX_SAFE_INTEGER,
    labels,
    readOnly,
    pagination,
  };
  function change(next: RelationshipValue | RelationshipValue[] | null) {
    if (Array.isArray(next)) props.onChange(next.map(({ collection, id }) => ({ collection, id })));
    else props.onChange(next ? [{ collection: next.collection, id: next.id }] : []);
  }
  return (
    <div className="space-y-3">
      {props.multiple ? (
        <RelationshipInput {...common} mode="multiple" value={selected} onChange={change} />
      ) : (
        <RelationshipInput
          {...common}
          mode="single"
          value={selected[0] ?? null}
          onChange={change}
        />
      )}
      {props.renderMediaPreviews === true
        ? values.map((value, index) => (
            <div key={relationshipKey(value)}>
              {field.services.renderPreview?.({
                reference: value,
                sourcePath: `${field.locale}:${props.sourcePath ?? ''}${props.multiple ? `.${index}` : ''}`,
                path: props.multiple ? [...(props.path ?? []), index] : (props.path ?? []),
              })}
            </div>
          ))
        : null}
    </div>
  );
}
