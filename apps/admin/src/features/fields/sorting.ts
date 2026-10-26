import type { SortableLabels } from '@new-cms/ui/data';
import type { FieldMessages } from './field-messages';

export function fieldSorting(t: FieldMessages, label: string): SortableLabels {
  return {
    listLabel: label,
    roleDescription: label,
    invalidItemsLabel: t.invalid,
    handleLabel: (value) => `${t.moveUp} / ${t.moveDown}: ${value}`,
    instructions: `${t.selection}: Space, ↑, ↓, Escape`,
    start: (value) => `${t.selection}: ${value}`,
    move: (value, position, total) => `${value}: ${position}/${total}`,
    end: (value, position, total) => `${value}: ${position}/${total}`,
    cancel: (value) => `${t.cancel}: ${value}`,
  };
}
