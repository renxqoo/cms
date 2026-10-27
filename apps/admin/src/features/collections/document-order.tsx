'use client';

import { useState } from 'react';
import { ArrowUpIcon, ArrowDownIcon, GripVerticalIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import type { DataTableColumn } from '@new-cms/ui/data';
import { documentOrderStateSchema } from '../../contracts/document-order';
import type { Collection } from '../../contracts/content';
import type { Document } from '../../contracts/documents';
import { useShell } from '../../components/shell/shell-provider';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { useContentMutation } from './use-content-mutation';
import { documentTitle, queryFilter } from './query';
import type { DocumentQuery } from './query';
import { orderingMessages } from './ordering-messages';

interface OrderOptions {
  collection: Collection;
  query: DocumentQuery;
  rows: readonly Document[];
  onChanged: () => void;
}
function containsNear(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if ('operator' in value && value.operator === 'near') return true;
  if ('and' in value && Array.isArray(value.and) && value.and.some(containsNear)) return true;
  return 'or' in value && Array.isArray(value.or) && value.or.some(containsNear);
}
function orderingEnabled(input: OrderOptions, access: ReturnType<typeof useAccessControl>) {
  const scope = { scopeKind: 'collection', collectionKey: input.collection.key } as const;
  const filter = queryFilter(input.query, input.collection);
  const allowed =
    input.collection.orderable &&
    ['documents.order', 'documents.reorder', 'documents.update', 'documents.list'].every(
      (operation) => access.can(operation, scope),
    );
  return (
    allowed &&
    input.query.mode === 'editing' &&
    !input.query.trashed &&
    filter.valid &&
    !containsNear(filter.where)
  );
}

export function useDocumentOrdering(input: OrderOptions) {
  const access = useAccessControl();
  const locale = useShell((state) => state.locale);
  const enabled = orderingEnabled(input, access);
  const custom = input.query.sort.length === 1 && input.query.sort[0]?.field === '_order';
  const state = useApiQuery({
    operation: 'documents.order',
    params: { collection: input.collection.key },
    query: { locale: input.query.locale },
    response: documentOrderStateSchema,
    enabled: enabled && custom,
  });
  const mutation = useContentMutation();
  const signature = JSON.stringify([input.collection.key, input.query]);
  const [drag, setDrag] = useState<{ signature: string; id: string | null }>({
    signature: '',
    id: null,
  });
  const ready =
    enabled &&
    custom &&
    state.phase === 'ready' &&
    Boolean(state.data?.version) &&
    !mutation.pending &&
    !mutation.locked;
  function move(id: string, targetId: string, position: 'before' | 'after') {
    if (!ready || !state.data?.version || id === targetId) return;
    void mutation.run(
      {
        operation: 'documents.reorder',
        params: { collection: input.collection.key },
        body: {
          locale: input.query.locale,
          version: state.data.version,
          ids: [id],
          targetId,
          position,
        },
        response: documentOrderStateSchema,
      },
      () => {
        state.reload();
        input.onChanged();
      },
    );
  }
  return {
    input,
    t: orderingMessages[locale],
    enabled,
    custom,
    state,
    mutation,
    ready,
    move,
    dragged: drag.signature === signature ? drag.id : null,
    setDragged: (id: string | null) => setDrag({ signature, id }),
  };
}
type OrderController = ReturnType<typeof useDocumentOrdering>;

function OrderCell({ controller, document }: { controller: OrderController; document: Document }) {
  const { rows, collection, query } = controller.input;
  const index = rows.findIndex((row) => row.id === document.id);
  const descending = query.sort[0]?.order === 'desc';
  const title = documentTitle(document, collection);
  const before = rows[index - 1];
  const after = rows[index + 1];
  return (
    <div className="flex min-w-28 gap-1">
      <Button
        size="icon-sm"
        variant="ghost"
        draggable={controller.ready}
        disabled={!controller.ready}
        aria-label={`${controller.t.drag} ${title}`}
        onDragStart={(event) => {
          event.dataTransfer.setData('text/plain', document.id);
          controller.setDragged(document.id);
        }}
        onDragEnd={() => controller.setDragged(null)}
        onDragOver={(event) => {
          if (controller.ready && controller.dragged) event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          const id = controller.dragged;
          const source = rows.findIndex((row) => row.id === id);
          if (id && source >= 0)
            controller.move(id, document.id, source < index !== descending ? 'after' : 'before');
          controller.setDragged(null);
        }}
      >
        <GripVerticalIcon aria-hidden="true" />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`${controller.t.up} ${title}`}
        disabled={!controller.ready || !before}
        onClick={() => {
          if (before) controller.move(document.id, before.id, descending ? 'after' : 'before');
        }}
      >
        <ArrowUpIcon aria-hidden="true" />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`${controller.t.down} ${title}`}
        disabled={!controller.ready || !after}
        onClick={() => {
          if (after) controller.move(document.id, after.id, descending ? 'before' : 'after');
        }}
      >
        <ArrowDownIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

export function documentOrderColumn(controller: OrderController): DataTableColumn<Document>[] {
  return controller.enabled && controller.custom
    ? [
        {
          key: 'customOrder',
          header: controller.t.order,
          cell: (document) => <OrderCell controller={controller} document={document} />,
        },
      ]
    : [];
}

export function DocumentOrderFeedback({
  controller,
  onSort,
}: {
  controller: OrderController;
  onSort: () => void;
}) {
  if (!controller.enabled) return null;
  const { input, state, mutation, t } = controller;
  return (
    <div className="space-y-3">
      {!controller.custom ? (
        <Button variant="outline" onClick={onSort}>
          {t.order}
        </Button>
      ) : null}
      <ManagementFeedback error={state.error} onRetry={state.reload} />
      <ManagementFeedback error={mutation.error} />
      {mutation.locked ? (
        <Button
          variant="outline"
          disabled={mutation.pending}
          onClick={() =>
            void mutation.verify(
              {
                operation: 'documents.order',
                params: { collection: input.collection.key },
                query: { locale: input.query.locale },
                response: documentOrderStateSchema,
              },
              () => {
                mutation.resolve();
                state.reload();
                input.onChanged();
              },
            )
          }
        >
          {t.refresh}
        </Button>
      ) : null}
    </div>
  );
}
