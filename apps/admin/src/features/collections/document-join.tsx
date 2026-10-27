'use client';

import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Field, Input } from '@new-cms/ui/forms';
import { Popover, PopoverTrigger, PopoverContent } from '@new-cms/ui/overlays';
import type { Collection } from '../../contracts/content';
import type { EditorNode } from '../../contracts/editor';
import { joinPageSchema } from '../../contracts/joins';
import { useShell } from '../../components/shell/shell-provider';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import type { EditorSnapshot } from './editor-read';
import type { FilterWhere, DocumentSort } from './query-filter';
import { collectionHref, documentTitle } from './query';
import { contentMessages } from './messages';
import { queryMessages } from './query-messages';
import { joinMessages } from './join-messages';
import { FilterBuilder } from './filter-builder';
import { SortBuilder } from './sort-builder';
import { JoinOrderButtons, useJoinOrder } from './document-join-order';

interface JoinProps {
  snapshot: EditorSnapshot;
  node: EditorNode;
  collections: readonly Collection[];
  active: boolean;
  readOnly: boolean;
}
interface JoinQuery {
  page: number;
  pageSize: number;
  where?: FilterWhere;
  sort?: DocumentSort[];
}

function sharedCollection(props: JoinProps): Collection {
  const targets = props.collections.filter((entry) =>
    props.node.constraints.join?.collections.includes(entry.key),
  );
  const first = targets[0] ?? props.snapshot.collection;
  return {
    ...first,
    orderable: props.node.constraints.join?.orderable === true,
    fields:
      targets.length === 0
        ? []
        : first.fields.filter((field) =>
            targets.every((target) =>
              target.fields.some(
                (other) =>
                  other.path === field.path &&
                  other.type === field.type &&
                  other.queryable &&
                  other.sortable === field.sortable,
              ),
            ),
          ),
  };
}

export function DocumentJoin(props: JoinProps) {
  const locale = useShell((state) => state.locale);
  if (!props.snapshot.document || props.snapshot.editor.intent === 'copy')
    return <p className="text-sm text-muted-foreground">{joinMessages[locale].saveFirst}</p>;
  return <JoinDocuments {...props} id={props.snapshot.document.id} />;
}

function useJoinDocuments(props: JoinProps & { id: string }) {
  const language = useShell((state) => state.locale);
  const t = contentMessages[language];
  const labels = queryMessages[language];
  const messages = joinMessages[language];
  const navigation = useAppNavigation();
  const [query, setQuery] = useState<JoinQuery>({
    page: 1,
    pageSize: props.node.constraints.join?.defaultPageSize ?? 1,
  });
  const collection = sharedCollection(props);
  const params = {
    collection: props.snapshot.collection.key,
    id: props.id,
    fieldId: props.node.id,
  };
  const request = {
    locale: props.snapshot.editor.locale,
    fallback: props.snapshot.editor.fallback,
    mode: props.snapshot.editor.mode,
    depth: 1,
    count: true,
    ...query,
  };
  const state = useApiQuery({
    operation: 'documents.join',
    params,
    query: request,
    response: joinPageSchema,
    enabled: props.active,
    contextKey: String(props.snapshot.document?.revision),
  });
  const order = useJoinOrder({
    ...params,
    locale: props.snapshot.editor.locale,
    editing: props.snapshot.editor.mode === 'editing' && !props.readOnly,
    orderable: props.node.constraints.join?.orderable === true,
    targets: props.node.constraints.join?.collections ?? [],
    page: state.data,
    ready: state.phase === 'ready' && props.active,
    reload: state.reload,
  });
  const change = (next: Partial<JoinQuery>) =>
    setQuery({ ...query, ...next, page: next.page ?? 1 });
  return {
    props,
    t,
    labels,
    messages,
    navigation,
    query,
    setQuery,
    collection,
    params,
    request,
    state,
    order,
    change,
  };
}
type JoinController = ReturnType<typeof useJoinDocuments>;
function JoinDocuments(props: JoinProps & { id: string }) {
  const controller = useJoinDocuments(props);
  const { state, order, params, request, messages } = controller;
  if (!props.active) return null;
  return (
    <section aria-label={props.node.label} className="min-w-0 space-y-3">
      <JoinControls controller={controller} />
      <ManagementFeedback error={state.error} onRetry={state.reload} />
      <ManagementFeedback error={order.mutation.error} />
      {order.mutation.locked ? (
        <Button
          variant="outline"
          disabled={order.mutation.pending}
          onClick={() =>
            void order.mutation.verify(
              { operation: 'documents.join', params, query: request, response: joinPageSchema },
              () => {
                order.mutation.resolve();
                state.reload();
              },
            )
          }
        >
          {messages.refresh}
        </Button>
      ) : null}
      <JoinTable controller={controller} />
      {state.phase === 'ready' && state.data?.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{messages.empty}</p>
      ) : null}
      <JoinPagination controller={controller} />
    </section>
  );
}

function JoinControls({ controller }: { controller: JoinController }) {
  const { t, labels, query, setQuery, collection, state, change } = controller;
  return (
    <div className="flex flex-wrap gap-2">
      <Popover>
        <PopoverTrigger
          render={
            <Button variant="outline">
              {t.filters}
              {query.where ? ' ·' : ''}
            </Button>
          }
        />
        <PopoverContent className="max-h-[80vh] w-[min(48rem,calc(100vw-2rem))] overflow-auto">
          <FilterBuilder
            key={JSON.stringify(query.where)}
            collection={collection}
            value={query.where}
            t={t}
            onApply={(where) =>
              setQuery(({ where: _old, ...current }) => ({
                ...current,
                page: 1,
                ...(where ? { where } : {}),
              }))
            }
          />
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger render={<Button variant="outline">{labels.sort}</Button>} />
        <PopoverContent className="max-h-[80vh] w-[min(40rem,calc(100vw-2rem))] overflow-auto">
          <SortBuilder
            key={JSON.stringify(query.sort ?? state.data?.sort)}
            collection={collection}
            value={query.sort ?? state.data?.sort ?? []}
            onApply={(sort) => change({ sort })}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
function JoinTable({ controller }: { controller: JoinController }) {
  const { props, messages, labels, state, order, navigation } = controller;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th scope="col" className="p-3 text-left">
              {messages.title}
            </th>
            <th scope="col" className="p-3 text-left">
              {messages.collection}
            </th>
            {order.allowed && order.sorted ? (
              <th scope="col" className="p-3 text-left">
                {labels.sort}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {state.data?.rows.map((row) => {
            const target = props.collections.find((entry) => entry.key === row.collection);
            const title = 'data' in row && target ? documentTitle(row, target) : row.id;
            return (
              <tr key={row.id} className="border-t">
                <td className="p-3">
                  <Button
                    variant="link"
                    onClick={() =>
                      navigation.push(
                        `${collectionHref(row.collection, row.id)}?locale=${encodeURIComponent(props.snapshot.editor.locale)}&mode=${props.snapshot.editor.mode}`,
                      )
                    }
                  >
                    {title}
                  </Button>
                </td>
                <td className="p-3">{target?.label ?? row.collection}</td>
                {order.allowed && order.sorted ? (
                  <td className="p-3">
                    <JoinOrderButtons order={order} id={row.id} title={title} />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function JoinPagination({ controller }: { controller: JoinController }) {
  const { props, messages, state, query, change } = controller;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        disabled={state.phase !== 'ready' || query.page === 1}
        onClick={() => change({ page: query.page - 1 })}
      >
        {messages.previous}
      </Button>
      <span className="text-sm">
        {query.page}
        {state.data?.total === undefined ? '' : ` · ${messages.count} ${state.data.total}`}
      </span>
      <Button
        variant="outline"
        disabled={state.phase !== 'ready' || !state.data?.hasNextPage}
        onClick={() => change({ page: query.page + 1 })}
      >
        {messages.next}
      </Button>
      <Field id={`join-${props.node.id}-size`} label={messages.pageSize}>
        <Input
          key={query.pageSize}
          type="number"
          min={1}
          max={props.node.constraints.join?.maxPageSize}
          defaultValue={query.pageSize}
          className="w-24"
          onBlur={(event) => {
            const pageSize = Number(event.currentTarget.value);
            if (
              Number.isSafeInteger(pageSize) &&
              pageSize > 0 &&
              pageSize <= (props.node.constraints.join?.maxPageSize ?? query.pageSize)
            )
              change({ pageSize });
            else event.currentTarget.value = String(query.pageSize);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.blur();
            }
          }}
        />
      </Field>
    </div>
  );
}
