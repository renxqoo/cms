import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { CodeEditor } from '../forms/code-editor.tsx';
import type { CodeEditorProps } from '../forms/code-editor.tsx';

const engine = vi.hoisted(() => ({
  mode: 'ready' as 'ready' | 'pending' | 'error',
  height: 180,
  listeners: new Set<() => void>(),
  initialized: vi.fn<() => void>(),
  canceled: vi.fn<() => void>(),
  disposed: vi.fn<() => void>(),
}));

vi.mock('@monaco-editor/react', async () => {
  const { useEffect, useRef } = await import('react');
  interface EditorProps {
    value: string;
    height: number;
    theme: string;
    options: { readOnly: boolean; ariaLabel: string };
    onChange: (value?: string) => void;
    onMount: (instance: {
      getContentHeight(): number;
      onDidContentSizeChange(listener: () => void): { dispose(): void };
    }) => void;
  }
  function Editor(props: EditorProps) {
    const onMount = useRef(props.onMount);
    useEffect(() => {
      onMount.current({
        getContentHeight: () => engine.height,
        onDidContentSizeChange: (listener) => {
          engine.listeners.add(listener);
          return {
            dispose() {
              engine.listeners.delete(listener);
              engine.disposed();
            },
          };
        },
      });
    }, []);
    return (
      <textarea
        aria-label={props.options.ariaLabel}
        value={props.value}
        readOnly={props.options.readOnly}
        style={{
          height: props.height,
          backgroundColor: props.theme === 'vs-dark' ? 'black' : 'white',
        }}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Delete') props.onChange();
        }}
      />
    );
  }
  return {
    Editor,
    loader: {
      config: vi.fn<(settings: unknown) => void>(),
      init() {
        engine.initialized();
        const pending =
          engine.mode === 'pending'
            ? new Promise<void>(() => {})
            : engine.mode === 'error'
              ? Promise.reject(new Error('Private loader diagnostic'))
              : Promise.resolve();
        return Object.assign(pending, { cancel: engine.canceled });
      },
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  engine.mode = 'ready';
  engine.height = 180;
  engine.listeners.clear();
});

function editorProps(changes: Partial<CodeEditorProps> = {}): CodeEditorProps {
  return {
    value: '{"title":"OneAster"}',
    onChange: vi.fn<(value: string) => void>(),
    language: 'json',
    theme: 'light',
    label: 'JSON editor',
    loadingLabel: 'Loading code editor',
    errorLabel: 'The code editor could not load',
    retryLabel: 'Reload editor',
    onRetry: vi.fn<() => void>(),
    minHeight: 100,
    maxHeight: 300,
    assetBaseUrl: '/generated/editor/vs',
    ...changes,
  };
}

function ControlledEditor({ settings }: { settings: CodeEditorProps }) {
  const [value, setValue] = useState(settings.value);
  return (
    <CodeEditor
      {...settings}
      value={value}
      onChange={(next) => {
        setValue(next);
        settings.onChange(next);
      }}
    />
  );
}

it('edits a controlled value and reports an empty edit as an empty string', async () => {
  const settings = editorProps();
  const user = userEvent.setup();
  render(<ControlledEditor settings={settings} />);
  const input = await screen.findByRole('textbox', { name: 'JSON editor' });
  await user.clear(input);
  await user.type(input, 'new content');
  expect(input).toHaveValue('new content');
  expect(settings.onChange).toHaveBeenLastCalledWith('new content');
  fireEvent.keyDown(input, { key: 'Delete' });
  expect(settings.onChange).toHaveBeenLastCalledWith('');
});

it('keeps a read-only editor unchanged while applying theme and external values', async () => {
  const settings = editorProps({ readOnly: true, theme: 'dark' });
  const { rerender } = render(<CodeEditor {...settings} />);
  const input = await screen.findByRole('textbox', { name: 'JSON editor' });
  expect(input).toHaveStyle({ backgroundColor: 'rgb(0, 0, 0)' });
  fireEvent.change(input, { target: { value: 'changed' } });
  expect(settings.onChange).not.toHaveBeenCalled();
  rerender(<CodeEditor {...settings} value="external update" />);
  expect(input).toHaveValue('external update');
});

it('bounds content height, responds to new budgets and releases its content listener', async () => {
  const settings = editorProps();
  const { rerender, unmount } = render(<CodeEditor {...settings} />);
  const input = await screen.findByRole('textbox', { name: 'JSON editor' });
  await waitFor(() => expect(input).toHaveStyle({ height: '180px' }));
  act(() => {
    engine.height = 600;
    engine.listeners.forEach((listener) => listener());
  });
  expect(input).toHaveStyle({ height: '300px' });
  rerender(<CodeEditor {...settings} maxHeight={200} />);
  expect(input).toHaveStyle({ height: '200px' });
  act(() => {
    engine.height = 20;
    engine.listeners.forEach((listener) => listener());
  });
  expect(input).toHaveStyle({ height: '100px' });
  unmount();
  expect(engine.listeners.size).toBe(0);
  expect(engine.disposed).toHaveBeenCalled();
});

it('cancels a pending initialization when the editor is removed', async () => {
  engine.mode = 'pending';
  const { unmount } = render(<CodeEditor {...editorProps()} />);
  await waitFor(() => expect(engine.initialized).toHaveBeenCalled());
  expect(screen.getByRole('status')).toHaveTextContent('Loading code editor');
  unmount();
  expect(engine.canceled).toHaveBeenCalled();
});

it('reports a loader failure without exposing diagnostics and provides an explicit retry', async () => {
  engine.mode = 'error';
  const settings = editorProps();
  const user = userEvent.setup();
  render(<CodeEditor {...settings} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(settings.errorLabel);
  expect(screen.queryByText('Private loader diagnostic')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: settings.retryLabel }));
  expect(settings.onRetry).toHaveBeenCalledOnce();
});

it.each([
  { minHeight: 0 },
  { minHeight: Number.NaN },
  { maxHeight: Number.POSITIVE_INFINITY },
  { minHeight: 200, maxHeight: 100 },
  { assetBaseUrl: 'https://cdn.example.test/vs' },
  { assetBaseUrl: '//cdn.example.test/vs' },
  { assetBaseUrl: '/generated/../editor' },
  { assetBaseUrl: '/generated/editor?other=1' },
])(
  'rejects an invalid height budget or external script location before starting the loader',
  (invalid) => {
    const settings = editorProps(invalid);
    render(<CodeEditor {...settings} />);
    expect(screen.getByRole('alert')).toHaveTextContent(settings.errorLabel);
    expect(engine.initialized).not.toHaveBeenCalled();
  },
);
