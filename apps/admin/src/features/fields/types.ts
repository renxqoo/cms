import type { ReactNode } from 'react';
import type { EditorNode } from '../../contracts/editor';
import type { RelationshipOption } from '../../components/cms/relationship-types';

export type JsonValue = string | number | boolean | null | JsonValue[] | FieldData;
export interface FieldData {
  [key: string]: JsonValue;
}

export interface ReferenceValue {
  collection: string;
  id: string;
}

export interface ReferenceQuery {
  context?: 'admin';
  collections: readonly string[];
  collection: string;
  query: string;
  id?: string;
  page: number;
  locale: string;
  sourcePath: string;
  filterOptions?: boolean;
  signal: AbortSignal;
}

export interface ReferencePage {
  rows: RelationshipOption[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReferenceEditorRequest {
  collection: string;
  id: string | null;
  locale: string;
  onComplete: (value: ReferenceValue) => Promise<boolean>;
  onClose: () => void;
}

export interface FieldServices {
  canEditReference?: (collection: string, action: 'create' | 'update') => boolean;
  renderReferenceEditor?: (input: ReferenceEditorRequest) => ReactNode;
  collections: readonly {
    id: string;
    label: string;
    upload?: boolean;
    richTextLink?: boolean;
    richTextRelationship?: boolean;
    locales?: readonly string[];
    defaultLocale?: string;
  }[];
  referenceContextKey?: string;
  renderJoin?: (input: {
    node: EditorNode;
    location: FieldLocation;
    readOnly: boolean;
    active: boolean;
  }) => ReactNode;
  searchReferences: (input: ReferenceQuery) => Promise<ReferencePage>;
  renderPreview?: (input: {
    reference: ReferenceValue;
    path: FieldPath;
    sourcePath: string;
  }) => ReactNode;
}

export interface FieldRendererProps {
  renderFields?: (input: NestedFieldInput) => ReactNode;
  active?: boolean;
  idPrefix: string;
  layout: readonly EditorNode[];
  value: FieldData;
  onChange: (value: FieldData) => void;
  onValidityChange: (key: string, error: string | null) => void;
  resetKey: string;
  locale: string;
  services: FieldServices;
  readOnly?: boolean;
  enforceRequired?: boolean;
  errors?: Readonly<Record<string, string>>;
  richTextNodes?: readonly { type: string; version: string }[];
  renderControl?: (input: {
    node: EditorNode;
    location: FieldLocation;
    readOnly: boolean;
  }) => ReactNode | undefined;
  visibility?: Readonly<Record<string, boolean>>;
  componentProps?: Readonly<Record<string, FieldData>>;
  choiceOptions?: Readonly<Record<string, NonNullable<EditorNode['constraints']['options']>>>;
}

export interface NestedFieldInput {
  readOnly: boolean;
  idPrefix: string;
  layout: readonly EditorNode[];
  value: FieldData;
  onChange: (value: FieldData) => void;
  onValidityChange: (key: string, error: string | null) => void;
  resetKey: string;
}

export type FieldPath = readonly (string | number)[];

export interface FieldLocation {
  adminReadOnly?: boolean;
  path: FieldPath;
  identity: string;
  sourcePath: string;
}
