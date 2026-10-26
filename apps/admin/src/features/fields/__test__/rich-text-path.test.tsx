import { act, render, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { expect, it, vi } from 'vitest';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import type { LexicalEditor } from 'lexical';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { FieldsProvider } from '../field-context';
import { RichLocation } from '../rich-text-reference';
import { RichTextBridge } from '../rich-text-bridge';
import { prepareRichText, richTextLexicalNodes } from '../rich-text-mapping';
import { parseRichText } from '../rich-text-value';
import type { RichTextValue } from '../rich-text-value';
import type { FieldData, FieldServices } from '../types';
import { rowA, services } from './support';

function Capture({ onReady }: { onReady: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => onReady(editor), [editor, onReady]);
  return null;
}

function Harness({
  onReady,
  onChange,
  renderPreview,
}: {
  onReady: (editor: LexicalEditor) => void;
  onChange: (value: FieldData) => void;
  renderPreview: NonNullable<FieldServices['renderPreview']>;
}) {
  const [value, setValue] = useState<RichTextValue>({
    version: 1,
    children: [
      { type: 'paragraph', children: [{ type: 'media', collection: 'images', id: rowA }] },
    ],
  });
  return (
    <ShellProvider
      initial={{ locale: 'en', theme: 'light', sidebarOpen: true, collapsedGroups: [] }}
    >
      <FieldsProvider
        value={{
          idPrefix: 'fields',
          layout: [],
          value: {},
          onChange: () => {},
          onValidityChange: () => {},
          resetKey: 'one',
          locale: 'en',
          services: { ...services(), renderPreview },
        }}
      >
        <RichLocation value={{ path: ['Body'], identity: 'fields/Body', sourcePath: 'Body' }}>
          <LexicalComposer
            initialConfig={{
              namespace: 'path',
              nodes: richTextLexicalNodes,
              editorState: prepareRichText(value),
              onError: (error) => {
                throw error;
              },
            }}
          >
            <RichTextPlugin
              contentEditable={<ContentEditable aria-label="Body" />}
              ErrorBoundary={LexicalErrorBoundary}
            />
            <RichTextBridge
              value={value}
              identity="fields/Body"
              readOnly={false}
              onInvalidChange={() => {}}
              onChange={(next) => {
                onChange(next);
                const parsed = parseRichText(next);
                if (parsed) setValue(parsed);
              }}
            />
            <Capture onReady={onReady} />
          </LexicalComposer>
        </RichLocation>
      </FieldsProvider>
    </ShellProvider>
  );
}

it('updates a media preview position when an ancestor moves without dirtying the media node and cleans its listener', async () => {
  const controls: { editor: LexicalEditor | null } = { editor: null };
  const changed = vi.fn<(value: FieldData) => void>();
  const preview = vi.fn<NonNullable<FieldServices['renderPreview']>>((): ReactElement => (
    <span>Pinned preview</span>
  ));
  const view = render(
    <Harness
      onReady={(editor) => {
        controls.editor = editor;
      }}
      onChange={changed}
      renderPreview={preview}
    />,
  );
  await waitFor(() =>
    expect(preview).toHaveBeenCalledWith({
      reference: { collection: 'images', id: rowA },
      path: ['Body', 'children', 0, 'children', 0],
      sourcePath: 'en:Body.children.0.children.0',
    }),
  );
  preview.mockClear();
  await act(async () => {
    controls.editor?.update(
      () => {
        $getRoot()
          .getFirstChild()
          ?.insertBefore($createParagraphNode().append($createTextNode('Intro')));
      },
      { discrete: true },
    );
    await Promise.resolve();
  });
  expect(changed).toHaveBeenLastCalledWith({
    version: 1,
    children: [
      { type: 'paragraph', children: [{ type: 'text', text: 'Intro' }] },
      { type: 'paragraph', children: [{ type: 'media', collection: 'images', id: rowA }] },
    ],
  });
  await waitFor(() =>
    expect(preview).toHaveBeenCalledWith({
      reference: { collection: 'images', id: rowA },
      path: ['Body', 'children', 1, 'children', 0],
      sourcePath: 'en:Body.children.1.children.0',
    }),
  );
  view.unmount();
  preview.mockClear();
  changed.mockClear();
  controls.editor?.update(
    () => {
      $getRoot().getFirstChild()?.insertBefore($createParagraphNode());
    },
    { discrete: true },
  );
  expect(preview).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
});
