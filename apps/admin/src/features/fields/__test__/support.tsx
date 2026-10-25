import { useState } from 'react';
import { vi } from 'vitest';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { FieldRenderer } from '../field-renderer';
import type { EditorNode } from '../../../contracts/editor';
import type { FieldData, FieldRendererProps } from '../types';

export const rowA = '019aad44-1df0-7000-8000-000000000001';
export const rowB = '019aad44-1df0-7000-8000-000000000002';

export function node(name: string, extra: Partial<EditorNode> = {}): EditorNode {
  return {
    id: name,
    name,
    label: name,
    type: 'text',
    required: false,
    localized: false,
    write: 'allowed',
    constraints: {},
    ...extra,
  };
}

export function services() {
  return {
    collections: [
      { id: 'pages', label: 'Pages' },
      { id: 'images', label: 'Images', upload: true },
    ],
    searchReferences: vi
      .fn<FieldRendererProps['services']['searchReferences']>()
      .mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 10 }),
  };
}

interface HarnessProps extends Omit<
  FieldRendererProps,
  'value' | 'idPrefix' | 'onChange' | 'onValidityChange' | 'resetKey' | 'locale' | 'services'
> {
  initial?: FieldData;
  services?: FieldRendererProps['services'];
  onChange?: (value: FieldData) => void;
  onValidityChange?: FieldRendererProps['onValidityChange'];
  language?: 'en' | 'zh';
  contentLocale?: string;
}

export function Harness({
  initial = {},
  language = 'en',
  contentLocale = 'en',
  services: ports,
  onChange,
  onValidityChange,
  ...props
}: HarnessProps) {
  const [value, setValue] = useState(initial);
  const [invalid, setInvalid] = useState<Record<string, string | null>>({});
  return (
    <ShellProvider
      initial={{ locale: language, theme: 'dark', sidebarOpen: true, collapsedGroups: [] }}
    >
      <FieldRenderer
        {...props}
        idPrefix="fields"
        resetKey="one"
        value={value}
        locale={contentLocale}
        services={ports ?? services()}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
        onValidityChange={(key, error) => {
          setInvalid((before) => (before[key] === error ? before : { ...before, [key]: error }));
          onValidityChange?.(key, error);
        }}
      />
      <output aria-label="Data">{JSON.stringify(value)}</output>
      <output aria-label="Invalid">
        {JSON.stringify(
          Object.fromEntries(Object.entries(invalid).filter(([, error]) => error !== null)),
        )}
      </output>
    </ShellProvider>
  );
}
