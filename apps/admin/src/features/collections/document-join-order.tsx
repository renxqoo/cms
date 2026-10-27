'use client';

import { useState } from 'react';
import { ArrowUpIcon, ArrowDownIcon, GripVerticalIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import type { JoinPage } from '../../contracts/joins';
import { documentOrderStateSchema } from '../../contracts/document-order';
import { useShell } from '../../components/shell/shell-provider';
import { useAccessControl } from '../access-control/provider';
import { useContentMutation } from './use-content-mutation';
import { orderingMessages } from './ordering-messages';

export interface JoinOrderInput {
  collection: string;
  id: string;
  fieldId: string;
  locale: string;
  editing: boolean;
  orderable: boolean;
  targets: readonly string[];
  page: JoinPage | null;
  ready: boolean;
  reload: () => void;
}

export function useJoinOrder(input: JoinOrderInput) {
  const access = useAccessControl();
  const mutation = useContentMutation();
  const [dragged, setDragged] = useState<string | null>(null);
  const source = { scopeKind: 'collection', collectionKey: input.collection } as const;
  const allowed =
    input.editing &&
    input.orderable &&
    access.can('documents.reorderJoin', source) &&
    input.targets.every((collectionKey) =>
      ['documents.list', 'documents.update', 'documents.reorder'].every((op) =>
        access.can(op, { scopeKind: 'collection', collectionKey }),
      ),
    );
  const sorted = input.page?.sort.length === 1 && input.page.sort[0]?.field === '_order';
  const ready =
    allowed &&
    sorted &&
    input.ready &&
    Boolean(input.page?.orderVersion) &&
    !mutation.pending &&
    !mutation.locked;
  function move(id: string, targetId: string, position: 'before' | 'after') {
    if (!ready || !input.page?.orderVersion || id === targetId) return;
    void mutation.run(
      {
        operation: 'documents.reorderJoin',
        params: { collection: input.collection, id: input.id, fieldId: input.fieldId },
        body: {
          locale: input.locale,
          version: input.page.orderVersion,
          ids: [id],
          targetId,
          position,
        },
        response: documentOrderStateSchema,
      },
      input.reload,
    );
  }
  return { input, allowed, sorted, ready, move, mutation, dragged, setDragged };
}
export type JoinOrder = ReturnType<typeof useJoinOrder>;

export function JoinOrderButtons({
  order,
  id,
  title,
}: {
  order: JoinOrder;
  id: string;
  title: string;
}) {
  const locale = useShell((state) => state.locale);
  const t = orderingMessages[locale];
  const rows = order.input.page?.rows ?? [];
  const index = rows.findIndex((row) => row.id === id);
  const previous = rows[index - 1];
  const next = rows[index + 1];
  const descending = order.input.page?.sort[0]?.order === 'desc';
  if (!order.allowed || !order.sorted) return null;
  return (
    <div className="flex gap-1">
      <Button
        size="icon-sm"
        variant="ghost"
        draggable={order.ready}
        disabled={!order.ready}
        aria-label={`${t.drag} ${title}`}
        onDragStart={(event) => {
          event.dataTransfer.setData('text/plain', id);
          order.setDragged(id);
        }}
        onDragEnd={() => order.setDragged(null)}
        onDragOver={(event) => {
          if (order.ready && order.dragged) event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          const moving = order.dragged;
          const source = rows.findIndex((row) => row.id === moving);
          if (moving && source >= 0)
            order.move(moving, id, source < index !== descending ? 'after' : 'before');
          order.setDragged(null);
        }}
      >
        <GripVerticalIcon aria-hidden="true" />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`${t.up} ${title}`}
        disabled={!order.ready || !previous}
        onClick={() => {
          if (previous) order.move(id, previous.id, descending ? 'after' : 'before');
        }}
      >
        <ArrowUpIcon aria-hidden="true" />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`${t.down} ${title}`}
        disabled={!order.ready || !next}
        onClick={() => {
          if (next) order.move(id, next.id, descending ? 'before' : 'after');
        }}
      >
        <ArrowDownIcon aria-hidden="true" />
      </Button>
    </div>
  );
}
