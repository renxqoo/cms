'use client';

import { lazy, Suspense } from 'react';
import type { ComponentType } from 'react';
import { CodeEditorFailure, CodeEditorLoading } from './code-editor-feedback.tsx';
import type { CodeEditorProps } from './code-editor-types.ts';

export type { CodeEditorProps } from './code-editor-types.ts';

const EditorEngine = lazy<ComponentType<CodeEditorProps>>(() =>
  import('./code-editor-engine.tsx').catch(() => ({ default: CodeEditorFailure })),
);

function validOptions(props: CodeEditorProps): boolean {
  return (
    Number.isFinite(props.minHeight) &&
    props.minHeight > 0 &&
    Number.isFinite(props.maxHeight) &&
    props.maxHeight >= props.minHeight &&
    /^\/(?!\/)/.test(props.assetBaseUrl) &&
    !/[\\?#\s]/.test(props.assetBaseUrl) &&
    !props.assetBaseUrl.split('/').some((part) => part === '.' || part === '..')
  );
}

export function CodeEditor(props: CodeEditorProps) {
  return (
    <section
      aria-label={props.label}
      className="min-w-0 overflow-hidden rounded-lg border border-input"
      data-slot="code-editor"
    >
      <header className="border-b bg-muted/30 px-3 py-2 text-sm font-medium">{props.label}</header>
      {validOptions(props) ? (
        <Suspense fallback={<CodeEditorLoading {...props} />}>
          <EditorEngine key={props.assetBaseUrl} {...props} />
        </Suspense>
      ) : (
        <CodeEditorFailure {...props} />
      )}
    </section>
  );
}
