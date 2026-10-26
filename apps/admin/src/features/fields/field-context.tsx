'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useShell } from '../../components/shell/shell-provider';
import { changeField, fieldValue, pathName } from './data';
import { fieldMessages } from './field-messages';
import type { FieldRendererProps, FieldLocation, JsonValue } from './types';

const FieldsContext = createContext<FieldRendererProps | null>(null);
export const FieldsProvider = FieldsContext.Provider;

export function useFields() {
  const props = useContext(FieldsContext);
  if (!props) throw new Error('FieldRenderer is required');
  const locale = useShell((state) => state.locale);
  const theme = useShell((state) => state.theme);
  return { ...props, t: fieldMessages[locale], theme };
}

export function useFieldValue(location: FieldLocation) {
  const fields = useFields();
  const value = fieldValue(fields.value, location.path);
  function change(next: JsonValue) {
    fields.onChange(changeField(fields.value, location.path, next));
  }
  return { ...fields, value, change, error: fields.errors?.[pathName(location.path)] };
}

export interface RenderChildren {
  (nodes: FieldRendererProps['layout'], location: FieldLocation, readOnly: boolean): ReactNode;
}
