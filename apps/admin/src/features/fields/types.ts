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
  collections: readonly string[];
  collection: string;
  query: string;
  page: number;
  locale: string;
  signal: AbortSignal;
}

export interface ReferencePage {
  rows: RelationshipOption[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FieldServices {
  collections: readonly { id: string; label: string; upload?: boolean }[];
  searchReferences: (input: ReferenceQuery) => Promise<ReferencePage>;
  renderPreview?: (input: {
    reference: ReferenceValue;
    path: FieldPath;
    sourcePath: string;
  }) => ReactNode;
}

export interface FieldRendererProps {
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
}

export type FieldPath = readonly (string | number)[];

export interface FieldLocation {
  path: FieldPath;
  identity: string;
  sourcePath: string;
}
