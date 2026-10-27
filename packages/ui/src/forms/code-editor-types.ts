import type { editor } from 'monaco-editor';
import type { ReactNode } from 'react';

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: string;
  theme: 'light' | 'dark';
  label: string;
  labelContent?: ReactNode;
  loadingLabel: string;
  errorLabel: string;
  retryLabel: string;
  onRetry: () => void;
  minHeight: number;
  maxHeight: number;
  assetBaseUrl: string;
  readOnly?: boolean;
  options?: Omit<
    editor.IStandaloneEditorConstructionOptions,
    'value' | 'model' | 'language' | 'theme' | 'readOnly' | 'ariaLabel' | 'automaticLayout'
  >;
}
