export type PhysicalType =
  | 'uuid'
  | 'text'
  | 'integer'
  | 'bigint'
  | 'double precision'
  | 'boolean'
  | 'timestamptz'
  | 'jsonb'
  | 'tsvector';
export interface PhysicalColumn {
  name: string;
  type: PhysicalType;
  nullable?: boolean;
  generated?: { kind: 'textSearch'; column: string };
  default?: 'now()' | 'gen_random_uuid()' | '0' | '1' | 'false' | 'true';
}
export interface PhysicalIndex {
  name: string;
  columns: readonly string[];
  unique?: boolean;
  where?: { column: string; equals: string | number | boolean };
  method?: 'btree' | 'gin';
}
export interface PhysicalForeignKey {
  name: string;
  columns: readonly string[];
  targetTable: string;
  targetColumns: readonly string[];
  onDelete: 'cascade' | 'restrict';
  deferrable?: boolean;
}
export interface PhysicalTable {
  name: string;
  columns: readonly PhysicalColumn[];
  primaryKey: readonly string[];
  unique?: readonly (readonly string[])[];
  indexes: readonly PhysicalIndex[];
  foreignKeys: readonly PhysicalForeignKey[];
}
export interface PhysicalPlan {
  version: number;
  tables: readonly PhysicalTable[];
}
