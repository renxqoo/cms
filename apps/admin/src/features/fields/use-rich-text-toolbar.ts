'use client';

import { useEffect, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $isHeadingNode } from '@lexical/rich-text';
import { $isListNode } from '@lexical/list';
import { mergeRegister } from '@lexical/utils';
import {
  $getSelection,
  $isRangeSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
} from 'lexical';

function $selectedBlock() {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const node = selection.anchor.getNode();
  const ancestors = [node, ...node.getParents()];
  if (ancestors.some($isListNode)) return 'list';
  if (ancestors.some($isHeadingNode)) return 'heading';
  return 'paragraph';
}

export function useRichTextToolbar() {
  const [editor] = useLexicalComposerContext();
  const [block, setBlock] = useState<ReturnType<typeof $selectedBlock>>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  useEffect(() => {
    function update() {
      setBlock($selectedBlock());
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
  return { block, canUndo, canRedo };
}
