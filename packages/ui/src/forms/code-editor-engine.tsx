'use client';

import { Editor, loader } from '@monaco-editor/react';
import type { OnMount } from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';
import { CodeEditorFailure, CodeEditorLoading } from './code-editor-feedback.tsx';
import type { CodeEditorProps } from './code-editor-types.ts';

export default function CodeEditorEngine(props: CodeEditorProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [contentHeight, setContentHeight] = useState(props.minHeight);
  const subscription = useRef<{ dispose(): void } | null>(null);
  useEffect(() => {
    let current = true;
    loader.config({ paths: { vs: props.assetBaseUrl } });
    const initialization = loader.init();
    async function initialize() {
      try {
        await initialization;
        if (current) setStatus('ready');
      } catch {
        if (current) setStatus('error');
      }
    }
    void initialize();
    return () => {
      current = false;
      initialization.cancel();
    };
  }, [props.assetBaseUrl]);
  useEffect(() => () => subscription.current?.dispose(), []);
  const mount: OnMount = (instance) => {
    subscription.current?.dispose();
    setContentHeight(instance.getContentHeight());
    subscription.current = instance.onDidContentSizeChange(() => {
      setContentHeight(instance.getContentHeight());
    });
  };
  if (status === 'error') return <CodeEditorFailure {...props} />;
  if (status === 'loading') return <CodeEditorLoading {...props} />;
  const height = Math.max(props.minHeight, Math.min(props.maxHeight, contentHeight));
  return (
    <Editor
      height={height}
      value={props.value}
      language={props.language}
      theme={props.theme === 'dark' ? 'vs-dark' : 'light'}
      saveViewState={false}
      keepCurrentModel={false}
      loading={<CodeEditorLoading {...props} />}
      options={{
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        ...props.options,
        readOnly: props.readOnly === true,
        ariaLabel: props.label,
        automaticLayout: true,
      }}
      onChange={(value) => {
        if (!props.readOnly) props.onChange(value ?? '');
      }}
      onMount={mount}
    />
  );
}
