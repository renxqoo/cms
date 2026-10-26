'use client';

import { useEffect, useEffectEvent, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  DROP_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  INSERT_LINE_BREAK_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  PASTE_COMMAND,
  SET_TEXT_FORMAT_COMMAND,
} from 'lexical';
import { INSERT_CHECK_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND } from '@lexical/list';
import { mergeRegister } from '@lexical/utils';
import { $exportRichText, prepareRichText } from './rich-text-mapping';
import { parseRichText, richTextData } from './rich-text-value';
import { useFields } from './field-context';
import type { FieldData } from './types';
import type { RichTextValue } from './rich-text-value';

export interface RichBridgeProps {
  value: RichTextValue;
  identity: string;
  readOnly: boolean;
  onChange: (value: FieldData) => void;
  onInvalidChange: (invalid: boolean) => void;
}

function plainPaste(event: ClipboardEvent | InputEvent | KeyboardEvent) {
  event.preventDefault();
  const selection = $getSelection();
  if ('clipboardData' in event && $isRangeSelection(selection))
    selection.insertText(event.clipboardData?.getData('text/plain') ?? '');
  return true;
}

function plainBreak() {
  const selection = $getSelection();
  if ($isRangeSelection(selection)) selection.insertText('\n');
  return true;
}

export function RichTextBridge(props: RichBridgeProps) {
  const [editor] = useLexicalComposerContext();
  const field = useFields();
  const last = useRef(JSON.stringify(props.value));
  const change = useEffectEvent((value: RichTextValue) => {
    const valid = parseRichText(value, field.richTextNodes);
    const invalid = valid === null;
    props.onInvalidChange(invalid);
    field.onValidityChange(props.identity, invalid ? field.t.invalidRich : null);
    if (valid) {
      last.current = JSON.stringify(valid);
      props.onChange(richTextData(valid));
    }
  });
  const invalid = useEffectEvent(() => {
    props.onInvalidChange(true);
    field.onValidityChange(props.identity, field.t.invalidRich);
  });
  const cleanup = useEffectEvent((identity: string) => field.onValidityChange(identity, null));
  useEffect(() => editor.setEditable(!props.readOnly), [editor, props.readOnly]);
  useEffect(() => {
    const next = JSON.stringify(props.value);
    if (next === last.current) return;
    const prepared = prepareRichText(props.value);
    if (prepared) {
      last.current = next;
      editor.setEditorState(editor.parseEditorState(prepared), { tag: 'external' });
    } else invalid();
  }, [editor, props.value]);
  useEffect(() => () => cleanup(props.identity), [props.identity]);
  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves, tags }) => {
        if (tags.has('external') || (dirtyElements.size === 0 && dirtyLeaves.size === 0)) return;
        try {
          change(editorState.read($exportRichText));
        } catch {
          invalid();
        }
      }),
    [editor],
  );
  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(PASTE_COMMAND, plainPaste, COMMAND_PRIORITY_HIGH),
        editor.registerCommand(INSERT_LINE_BREAK_COMMAND, plainBreak, COMMAND_PRIORITY_HIGH),
        editor.registerCommand(
          DROP_COMMAND,
          (event) => {
            event.preventDefault();
            return true;
          },
          COMMAND_PRIORITY_HIGH,
        ),
        editor.registerCommand(FORMAT_TEXT_COMMAND, () => true, COMMAND_PRIORITY_HIGH),
        editor.registerCommand(SET_TEXT_FORMAT_COMMAND, () => true, COMMAND_PRIORITY_HIGH),
        editor.registerCommand(FORMAT_ELEMENT_COMMAND, () => true, COMMAND_PRIORITY_HIGH),
        editor.registerCommand(INDENT_CONTENT_COMMAND, () => true, COMMAND_PRIORITY_HIGH),
        editor.registerCommand(OUTDENT_CONTENT_COMMAND, () => true, COMMAND_PRIORITY_HIGH),
        editor.registerCommand(INSERT_ORDERED_LIST_COMMAND, () => true, COMMAND_PRIORITY_HIGH),
        editor.registerCommand(INSERT_CHECK_LIST_COMMAND, () => true, COMMAND_PRIORITY_HIGH),
      ),
    [editor],
  );
  return null;
}
