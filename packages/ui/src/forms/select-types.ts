import type { SortableLabels } from '../data/sortable-list.tsx';

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
  disabled?: boolean;
}

export type SelectOptionsResult =
  | { status: 'success'; options: readonly SelectOption[] }
  | { status: 'error'; message: string };
export type SelectCreateResult =
  | { status: 'success'; option: SelectOption }
  | { status: 'error'; message: string };

interface SelectCommonProps {
  options: readonly SelectOption[];
  label: string;
  placeholder: string;
  emptyLabel: string;
  loadingLabel: string;
  errorLabel: string;
  clearLabel: string;
  removeLabel: (label: string) => string;
  disabled?: boolean;
  readOnly?: boolean;
  name?: string;
  loadOptions?: (input: { query: string; signal: AbortSignal }) => Promise<SelectOptionsResult>;
  onCreate?: (input: { query: string; signal: AbortSignal }) => Promise<SelectCreateResult>;
  createLabel?: (query: string) => string;
}

export type SelectProps = SelectCommonProps &
  (
    | {
        multiple: true;
        value: readonly string[];
        onChange: (value: string[]) => void;
        sorting: SortableLabels;
      }
    | { multiple?: false; value: string | null; onChange: (value: string | null) => void }
  );
