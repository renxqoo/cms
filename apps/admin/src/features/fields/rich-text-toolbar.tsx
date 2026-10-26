'use client';

import { useState } from 'react';
import { FileSearch, Heading2, Image, Link2, List, Pilcrow, Redo2, Undo2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  REDO_COMMAND,
  UNDO_COMMAND,
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
import { useRichTextToolbar } from './use-rich-text-toolbar';
import type { ReferenceValue } from './types';

interface Picker {
  kind: 'relationship' | 'media' | 'link';
  selection: RangeSelection | null;
}

function ToolbarAction({
  label,
  icon: Icon,
  active,
  disabled,
  iconOnly,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  disabled?: boolean;
  iconOnly?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      size={iconOnly ? 'icon' : 'default'}
      variant={active ? 'secondary' : 'ghost'}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <Icon aria-hidden="true" />
      {iconOnly ? null : label}
    </Button>
  );
}

function ToolbarHistory({ canUndo, canRedo }: { canUndo: boolean; canRedo: boolean }) {
  const [editor] = useLexicalComposerContext();
  const { t } = useFields();
  return (
    <div className="flex gap-0.5 border-r border-border pr-1">
      {[
        { label: t.undo, icon: Undo2, enabled: canUndo, command: UNDO_COMMAND },
        { label: t.redo, icon: Redo2, enabled: canRedo, command: REDO_COMMAND },
      ].map(({ label, icon, enabled, command }) => (
        <ToolbarAction
          key={label}
          label={label}
          icon={icon}
          iconOnly
          disabled={!enabled}
          onClick={() => editor.dispatchCommand(command)}
        />
      ))}
    </div>
  );
}

export function RichTextToolbar({ readOnly }: { readOnly: boolean }) {
  const [editor] = useLexicalComposerContext();
  const state = useRichTextToolbar();
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
      editor.dispatchCommand(
        state.block === 'list' ? REMOVE_LIST_COMMAND : INSERT_UNORDERED_LIST_COMMAND,
      );
    });
  }
  if (readOnly) return null;
  return (
    <>
      <div
        role="toolbar"
        aria-label={field.t.richText}
        className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/30 p-2"
      >
        <ToolbarHistory canUndo={state.canUndo} canRedo={state.canRedo} />
        <div className="flex gap-0.5 border-r border-border pr-1">
          <ToolbarAction
            label={field.t.paragraph}
            icon={Pilcrow}
            active={state.block === 'paragraph'}
            onClick={() => block(false)}
          />
          <ToolbarAction
            label={field.t.heading}
            icon={Heading2}
            active={state.block === 'heading'}
            onClick={() => block(true)}
          />
          <ToolbarAction
            label={field.t.list}
            icon={List}
            active={state.block === 'list'}
            onClick={list}
          />
        </div>
        <div className="flex flex-wrap gap-0.5">
          {(
            [
              { kind: 'link', icon: Link2 },
              { kind: 'relationship', icon: FileSearch },
              { kind: 'media', icon: Image },
            ] as const
          ).map(({ kind, icon }) => (
            <ToolbarAction
              key={kind}
              label={field.t[kind]}
              icon={icon}
              onClick={() => open(kind)}
            />
          ))}
        </div>
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
