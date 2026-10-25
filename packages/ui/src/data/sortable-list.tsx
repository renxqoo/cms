'use client';

import { useId } from 'react';
import type { ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { Announcements, DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVerticalIcon } from 'lucide-react';
import { cn } from '../cn.ts';
import { buttonStyles } from '../primitives/button-styles.ts';

export interface SortableLabels {
  listLabel: string;
  roleDescription: string;
  invalidItemsLabel: string;
  handleLabel: (label: string) => string;
  instructions: string;
  start: (label: string) => string;
  move: (label: string, position: number, total: number) => string;
  end: (label: string, position: number, total: number) => string;
  cancel: (label: string) => string;
}

export interface SortableListProps<T> {
  items: readonly T[];
  getId: (item: T) => string;
  getItemLabel: (item: T) => string;
  onChange: (items: T[]) => void;
  renderItem: (item: T, handle: ReactNode) => ReactNode;
  labels: SortableLabels;
  orientation?: 'vertical' | 'horizontal';
  disabled?: boolean;
  isItemDisabled?: (item: T) => boolean;
  className?: string;
}

interface SortableEntry {
  id: string;
  label: string;
}

function announcements(entries: readonly SortableEntry[], labels: SortableLabels): Announcements {
  function find(id: string | number) {
    return entries.find((entry) => entry.id === String(id));
  }
  return {
    onDragStart: ({ active }) => {
      const entry = find(active.id);
      return entry ? labels.start(entry.label) : undefined;
    },
    onDragOver: ({ active, over }) => {
      const entry = find(active.id);
      const position = entries.findIndex((candidate) => candidate.id === String(over?.id));
      return entry && position >= 0
        ? labels.move(entry.label, position + 1, entries.length)
        : undefined;
    },
    onDragEnd: ({ active, over }) => {
      const entry = find(active.id);
      const position = entries.findIndex((candidate) => candidate.id === String(over?.id));
      return entry
        ? position >= 0
          ? labels.end(entry.label, position + 1, entries.length)
          : labels.cancel(entry.label)
        : undefined;
    },
    onDragCancel: ({ active }) => {
      const entry = find(active.id);
      return entry ? labels.cancel(entry.label) : undefined;
    },
  };
}

function SortableItem<T>({
  item,
  id,
  label,
  roleDescription,
  disabled,
  renderItem,
}: {
  item: T;
  id: string;
  label: string;
  roleDescription: string;
  disabled: boolean;
  renderItem: SortableListProps<T>['renderItem'];
}) {
  const {
    setActivatorNodeRef,
    attributes,
    listeners,
    setNodeRef,
    isDragging,
    transform,
    transition,
  } = useSortable({ id, disabled });
  const handle = (
    <button
      ref={setActivatorNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      disabled={disabled}
      aria-label={label}
      aria-roledescription={roleDescription}
      className={cn(buttonStyles({ variant: 'ghost', size: 'icon-sm' }), 'touch-none cursor-grab')}
    >
      <GripVerticalIcon className="size-4" aria-hidden="true" />
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      role="listitem"
      className={cn('relative min-w-0', isDragging && 'z-10 opacity-70')}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {renderItem(item, handle)}
    </div>
  );
}

export function SortableList<T>({
  items,
  getId,
  getItemLabel,
  onChange,
  renderItem,
  labels,
  orientation = 'vertical',
  disabled = false,
  isItemDisabled,
  className,
}: SortableListProps<T>) {
  const id = useId();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const entries = items.map((item) => ({ id: getId(item), label: getItemLabel(item) }));
  const ids = entries.map((entry) => entry.id);
  if (ids.some((value) => value.length === 0) || new Set(ids).size !== ids.length)
    return <p role="alert">{labels.invalidItemsLabel}</p>;
  function reorder(event: DragEndEvent) {
    if (disabled || !event.over) return;
    const from = ids.indexOf(String(event.active.id));
    const to = ids.indexOf(String(event.over.id));
    if (from < 0 || to < 0 || from === to) return;
    const entry = items.at(from);
    if (entry === undefined || isItemDisabled?.(entry)) return;
    onChange(arrayMove([...items], from, to));
  }
  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={(context) =>
        context.pointerCoordinates ? pointerWithin(context) : closestCenter(context)
      }
      onDragEnd={reorder}
      accessibility={{
        announcements: announcements(entries, labels),
        screenReaderInstructions: { draggable: labels.instructions },
      }}
    >
      <SortableContext
        items={ids}
        strategy={orientation === 'vertical' ? verticalListSortingStrategy : rectSortingStrategy}
      >
        <div
          role="list"
          aria-label={labels.listLabel}
          className={cn(
            orientation === 'vertical' ? 'grid gap-2' : 'flex flex-wrap gap-2',
            className,
          )}
        >
          {items.map((item) => (
            <SortableItem
              key={getId(item)}
              id={getId(item)}
              item={item}
              label={labels.handleLabel(getItemLabel(item))}
              roleDescription={labels.roleDescription}
              disabled={disabled || isItemDisabled?.(item) === true}
              renderItem={renderItem}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
