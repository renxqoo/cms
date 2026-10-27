import type { AdminView } from '../../contracts/admin-components';
import type { ComponentType, ReactNode } from 'react';
import type { Collection, CollectionField } from '../../contracts/content';
import type { CollectionEditor, EditorNode } from '../../contracts/editor';
import type { Document } from '../../contracts/documents';
import type { FieldData, JsonValue, NestedFieldInput } from '../fields/types';

export type FieldComponentSlot =
  | 'Field'
  | 'Label'
  | 'Description'
  | 'Error'
  | 'Filter'
  | 'Diff'
  | 'RowLabel'
  | 'Block'
  | 'beforeInput'
  | 'afterInput';
export type CollectionComponentSlot =
  | 'Header'
  | 'List'
  | 'Edit'
  | 'Description'
  | 'beforeList'
  | 'afterList'
  | 'beforeEdit'
  | 'afterEdit'
  | 'beforeListTable'
  | 'afterListTable'
  | 'listMenuItems'
  | 'ListActions'
  | 'NoResults'
  | 'beforeDocumentControls'
  | 'BeforeDocumentMeta'
  | 'editMenuItems'
  | 'PreviewButton'
  | 'PublishButton'
  | 'SaveButton'
  | 'SaveDraftButton'
  | 'Status'
  | 'UnpublishButton'
  | 'Upload'
  | 'View'
  | 'ViewActions'
  | 'Icon'
  | 'SmallIcon';
export interface FieldComponentProps {
  renderFields?: (input: NestedFieldInput) => ReactNode;
  node: EditorNode;
  id: string;
  name: string;
  value: JsonValue | undefined;
  data: FieldData;
  locale: string;
  readOnly: boolean;
  error: string | undefined;
  onChange: (value: JsonValue) => void;
  onValidityChange?: (identity: string, error: string | null) => void;
  customProps?: FieldData;
  componentProps?: Readonly<Record<string, FieldData>>;
  componentNamespace?: string;
  row?: FieldData;
  rowIndex?: number;
  beforeValue?: JsonValue | undefined;
  afterValue?: JsonValue | undefined;
  operator?: string;
  children?: ReactNode;
}
export interface CellComponentProps {
  collection: Collection;
  field: CollectionField;
  document: Document;
  text: string;
  customProps?: FieldData;
  value: JsonValue | undefined;
  children?: ReactNode;
}
export interface CollectionComponentProps {
  view?: AdminView;
  customProps?: FieldData;
  disabled?: boolean;
  onAction?: () => void | Promise<void>;
  collection: Collection;
  document: Document | null;
  editor: CollectionEditor | null;
  readOnly: boolean;
  children?: ReactNode;
}
export interface AdminComponentRegistry {
  versions: Readonly<Record<string, string>>;
  fields: Partial<
    Record<FieldComponentSlot, Readonly<Record<string, ComponentType<FieldComponentProps>>>>
  >;
  cells: Readonly<Record<string, ComponentType<CellComponentProps>>>;
  collections: Partial<
    Record<
      CollectionComponentSlot,
      Readonly<Record<string, ComponentType<CollectionComponentProps>>>
    >
  >;
}
