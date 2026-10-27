import type { Where, SortField } from '../definition.ts';

export interface JoinDefinition {
  collection: string | readonly string[];
  field: string;
  where?: Where;
  defaultPageSize?: number;
  defaultSort?: readonly SortField[];
  orderable?: boolean;
}
export interface JoinQueryOptions {
  where?: Where;
  sort?: readonly SortField[];
  page?: number;
  pageSize?: number;
  count?: boolean;
}
export type JoinQueries = false | Readonly<Record<string, false | JoinQueryOptions>>;
