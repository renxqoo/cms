'use client';

import { useEffect, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $isHeadingNode, $isQuoteNode } from '@lexical/rich-text';
import { $isListNode } from '@lexical/list';
import { mergeRegister } from '@lexical/utils';
import {
  $getSelection,
  $isRangeSelection,
  $isElementNode,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
} from 'lexical';
import { richTextFormats } from './rich-text-value';

function $selectedBlock() {
  const selection = $getSelection();
  if (!$isRangeSelection(selection))
    return { block: null, level: 2, kind: 'bullet', formats: [] as string[], align: '', indent: 0 };
  const node = selection.anchor.getNode();
  const ancestors = [node, ...node.getParents()];
  const list = ancestors.find($isListNode);
  const heading = ancestors.find($isHeadingNode);
  const element = ancestors.find($isElementNode);
  let block = 'paragraph';
  if (ancestors.some($isQuoteNode)) block = 'quote';
  if (heading) block = 'heading';
  if (list) block = 'list';
  return {
    block,
    level: heading ? Number(heading.getTag().slice(1)) : 2,
    kind: list?.getListType() ?? 'bullet',
    formats: richTextFormats.filter((format) => selection.hasFormat(format)),
    align: element?.getFormatType() ?? '',
    indent: element?.getIndent() ?? 0,
  };
}

export function useRichTextToolbar() {
  const [editor] = useLexicalComposerContext();
  const [state, setState] = useState<ReturnType<typeof $selectedBlock>>({
    block: null,
    level: 2,
    kind: 'bullet',
    formats: [],
    align: '',
    indent: 0,
  });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  useEffect(() => {
    function update() {
      setState($selectedBlock());
    }
    editor.getEditorState().read(update);
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => editorState.read(update)),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          update();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (value) => {
          setCanUndo(value);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (value) => {
          setCanRedo(value);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor]);
  return { ...state, canUndo, canRedo };
}
