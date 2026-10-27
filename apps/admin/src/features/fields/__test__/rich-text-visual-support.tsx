import { useEffect } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  SET_TEXT_FORMAT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  INDENT_CONTENT_COMMAND,
  INSERT_LINE_BREAK_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  PASTE_COMMAND,
  SKIP_DOM_SELECTION_TAG,
} from 'lexical';
import { INSERT_CHECK_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND } from '@lexical/list';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { FieldsProvider } from '../field-context';
import { RichTextBridge } from '../rich-text-bridge';
import { prepareRichText, richTextLexicalNodes } from '../rich-text-mapping';
import { services } from './support';
import type { FieldData } from '../types';

export interface RichTestControls {
  current: {
    insertText: (value: string) => Promise<void>;
    format: () => Promise<void>;
    paste: (value?: string) => Promise<void>;
    softBreak: () => Promise<void>;
  } | null;
}

function Capture({
  onReady,
}: {
  onReady: (value: NonNullable<RichTestControls['current']>) => void;
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    onReady({
      insertText(value) {
        editor.update(
          () => {
            $getRoot().selectEnd();
            const selection = $getSelection();
            if ($isRangeSelection(selection)) selection.insertRawText(value);
          },
          { discrete: true },
        );
        return Promise.resolve();
      },
      format() {
        editor.update(
          () => {
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
            editor.dispatchCommand(SET_TEXT_FORMAT_COMMAND, { italic: true });
            editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'center');
            editor.dispatchCommand(INDENT_CONTENT_COMMAND);
            editor.dispatchCommand(OUTDENT_CONTENT_COMMAND);
            editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND);
            editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND);
          },
          { discrete: true, tag: SKIP_DOM_SELECTION_TAG },
        );
        return Promise.resolve();
      },
      softBreak() {
        editor.update(
          () => {
            $getRoot().selectEnd();
            editor.dispatchCommand(INSERT_LINE_BREAK_COMMAND, false);
          },
          { discrete: true, tag: SKIP_DOM_SELECTION_TAG },
        );
        return Promise.resolve();
      },
      paste(value) {
        const event = new KeyboardEvent('paste');
        Object.defineProperty(event, 'clipboardData', {
          value: {
            getData: (type: string) =>
              type === 'text/plain'
                ? (value ?? '<script>safe text</script>')
                : '<img src=x onerror=alert(1)>',
          },
        });
        editor.update(() => editor.dispatchCommand(PASTE_COMMAND, event), {
          discrete: true,
          tag: SKIP_DOM_SELECTION_TAG,
        });
        return Promise.resolve();
      },
    });
  }, [onReady, editor]);
  return null;
}

export function RichTextVisualHarness({
  onReady,
  onChange,
}: {
  onReady: (value: NonNullable<RichTestControls['current']>) => void;
  onChange: (value: FieldData) => void;
}) {
  const value = { version: 1 as const, children: [{ type: 'paragraph', children: [] }] };
  return (
    <ShellProvider
      initial={{ locale: 'en', theme: 'light', sidebarOpen: true, collapsedGroups: [] }}
    >
      <FieldsProvider
        value={{
          idPrefix: 'test',
          layout: [],
          value: {},
          onChange,
          onValidityChange: () => {},
          resetKey: 'one',
          locale: 'en',
          services: services(),
        }}
      >
        <LexicalComposer
          initialConfig={{
            namespace: 'test',
            nodes: richTextLexicalNodes,
            editorState: prepareRichText(value),
            onError: (error) => {
              throw error;
            },
          }}
        >
          <RichTextPlugin
            contentEditable={<ContentEditable aria-label="Editor" />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <RichTextBridge
            value={value}
            identity="test"
            readOnly={false}
            onChange={onChange}
            onInvalidChange={() => {}}
          />
          <Capture onReady={onReady} />
        </LexicalComposer>
      </FieldsProvider>
    </ShellProvider>
  );
}
