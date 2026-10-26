'use client';

import { useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
} from 'lexical';
import type { RangeSelection } from 'lexical';
import { $createHeadingNode } from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import { INSERT_UNORDERED_LIST_COMMAND, REMOVE_LIST_COMMAND } from '@lexical/list';
import { TOGGLE_LINK_COMMAND } from '@lexical/link';
import { Button } from '@new-cms/ui/actions';
import { Input } from '@new-cms/ui/forms';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@new-cms/ui/overlays';
import { useFields } from './field-context';
import { ReferenceControl } from './reference-control';
import { $createCmsReference } from './rich-text-reference';
import { safeRichTextLink } from './rich-text-value';
import type { ReferenceValue } from './types';

interface Picker {
  kind: 'relationship' | 'media' | 'link';
  selection: RangeSelection | null;
}

export function RichTextToolbar({ readOnly }: { readOnly: boolean }) {
  const [editor] = useLexicalComposerContext();
  const field = useFields();
  const [picker, setPicker] = useState<Picker | null>(null);
  const [selection, setSelection] = useState<ReferenceValue[]>([]);
  const [url, setUrl] = useState('');
  const collections = field.services.collections.filter(
    (entry) => picker?.kind !== 'media' || entry.upload === true,
  );
  function open(kind: Picker['kind']) {
    const saved = editor.getEditorState().read(() => {
      const current = $getSelection();
      return $isRangeSelection(current) ? current.clone() : null;
    });
    setSelection([]);
    setUrl('');
    setPicker({ kind, selection: saved });
  }
  function apply() {
    if (!picker || (picker.kind === 'link' ? !safeRichTextLink(url) : !selection[0])) return;
    editor.update(() => {
      if (picker.selection) $setSelection(picker.selection);
      else $getRoot().selectEnd();
      if (picker.kind === 'link') editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
      else if (selection[0]) {
        const current = $getSelection();
        if ($isRangeSelection(current))
          current.insertNodes([
            $createCmsReference({ kind: picker.kind, reference: selection[0] }),
          ]);
      }
    });
    setPicker(null);
    editor.focus();
  }
  function block(heading: boolean) {
    editor.dispatchCommand(REMOVE_LIST_COMMAND);
    editor.update(() => {
      const current = $getSelection();
      const selected = $isRangeSelection(current) ? current : $getRoot().selectEnd();
      $setBlocksType(selected, () => (heading ? $createHeadingNode('h2') : $createParagraphNode()));
    });
  }
  function list() {
    editor.update(() => {
      if (!$isRangeSelection($getSelection())) $getRoot().selectEnd();
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND);
    });
  }
  if (readOnly) return null;
  return (
    <>
      <div
        role="toolbar"
        aria-label={field.t.richText}
        className="flex flex-wrap gap-1 border-b p-2"
      >
        <Button
          size="sm"
          variant="ghost"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => block(false)}
        >
          {field.t.paragraph}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => block(true)}
        >
          {field.t.heading}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onMouseDown={(event) => event.preventDefault()}
          onClick={list}
        >
          {field.t.list}
        </Button>
        {(['link', 'relationship', 'media'] as const).map((kind) => (
          <Button
            key={kind}
            size="sm"
            variant="ghost"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => open(kind)}
          >
            {field.t[kind]}
          </Button>
        ))}
      </div>
      <Dialog
        open={picker !== null}
        onOpenChange={(next) => {
          if (!next) setPicker(null);
        }}
      >
        <DialogContent closeLabel={field.t.close} className="sm:max-w-lg">
          <DialogTitle>{picker ? field.t[picker.kind] : field.t.selection}</DialogTitle>
          {picker?.kind === 'link' ? (
            <Input
              aria-label={field.t.url}
              value={url}
              onChange={(event) => setUrl(event.currentTarget.value)}
              aria-invalid={url !== '' && !safeRichTextLink(url)}
            />
          ) : (
            <ReferenceControl
              label={field.t.selection}
              collectionKeys={collections.map((entry) => entry.id)}
              value={selection}
              onChange={setSelection}
              appearance="select"
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPicker(null)}>
              {field.t.cancel}
            </Button>
            <Button
              onClick={apply}
              disabled={picker?.kind === 'link' ? !safeRichTextLink(url) : selection.length !== 1}
            >
              {field.t.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
