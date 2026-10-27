import type { ReactNode } from 'react';
import type { SortableLabels } from '@new-cms/ui/data';

export interface RelationshipValue {
  collection: string;
  id: string;
  label: string;
  available?: boolean;
  previewUrl?: string;
}

export interface RelationshipOption extends RelationshipValue {
  disabled?: boolean;
}

export interface RelationshipLabels {
  search: string;
  chooseExisting: string;
  empty: string;
  loading: string;
  error: string;
  retry: string;
  clear: string;
  remove: string;
  unavailable: string;
  maximum: string;
  create: string;
  edit: string;
  moveUp: string;
  moveDown: string;
  close: string;
  collection: string;
  sorting: SortableLabels;
}

export interface RelationshipQuery {
  query: string;
  collection: string | null;
  signal: AbortSignal;
}

interface RelationshipBase {
  placeholder?: string | undefined;
  label: string;
  labelContent?: ReactNode;
  collections: readonly { id: string; label: string }[];
  options: readonly RelationshipOption[];
  appearance: 'select' | 'drawer';
  maxRows: number;
  pagination?: ReactNode;
  labels: RelationshipLabels;
  readOnly?: boolean | undefined;
  displayPreview?: boolean;
  filterOption?(this: void, option: RelationshipOption): boolean;
  loadOptions?(this: void, query: RelationshipQuery): Promise<readonly RelationshipOption[]>;
  canCreate?(this: void, collection: string): boolean;
  canEdit?(this: void, value: RelationshipValue): boolean;
  onCreate?(this: void, collection: string): void;
  onEdit?(this: void, value: RelationshipValue): void;
}

export type RelationshipInputProps = RelationshipBase &
  (
    | {
        mode: 'single';
        value: RelationshipValue | null;
        onChange(this: void, value: RelationshipValue | null): void;
      }
    | {
        mode: 'multiple';
        value: readonly RelationshipValue[];
        onChange(this: void, value: RelationshipValue[]): void;
      }
  );

export function relationshipKey(value: { collection: string; id: string }): string {
  return JSON.stringify([value.collection, value.id]);
}

export function relationshipValues(props: RelationshipInputProps): readonly RelationshipValue[] {
  if (props.mode === 'multiple') return props.value;
  return props.value ? [props.value] : [];
}
