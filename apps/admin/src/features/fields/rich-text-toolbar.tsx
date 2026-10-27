'use client';

import { applyRichTextPick } from './rich-text-pick';
import type { RichTextPicker as Picker } from './rich-text-pick';
import { fieldEditorPolicy } from './policy';

import { useState } from 'react';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Bold,
  Code,
  FileSearch,
  Heading2,
  Image,
  IndentIncrease,
  IndentDecrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListChecks,
  Minus,
  Pilcrow,
  Redo2,
  Strikethrough,
  Subscript,
  Superscript,
  TextQuote,
  Underline,
  Undo2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  REDO_COMMAND,
  UNDO_COMMAND,
  FORMAT_TEXT_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
} from 'lexical';
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from '@lexical/list';
import type { ListType } from '@lexical/list';
import { INSERT_HORIZONTAL_RULE_COMMAND } from '@lexical/react/LexicalHorizontalRuleNode';
import { Button } from '@new-cms/ui/actions';
import { Input, NativeSelect } from '@new-cms/ui/forms';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@new-cms/ui/overlays';
import { useFields } from './field-context';
import { ReferenceControl } from './reference-control';
import { safeRichTextLink } from './rich-text-value';
import { useRichTextToolbar } from './use-rich-text-toolbar';
import { headingTag } from './rich-text-schema';
import type { ReferenceValue } from './types';

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
    <div className="flex max-w-full flex-wrap gap-0.5 border-r border-border pr-1">
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

type ToolbarState = ReturnType<typeof useRichTextToolbar>;

function RichTextFormats({ state }: { state: ToolbarState }) {
  const [editor] = useLexicalComposerContext();
  const field = useFields();
  return (
    <>
      <div className="flex flex-wrap gap-0.5 border-r border-border pr-1">
        {(
          [
            { format: 'bold', icon: Bold },
            { format: 'italic', icon: Italic },
            { format: 'underline', icon: Underline },
            { format: 'strikethrough', icon: Strikethrough },
            { format: 'subscript', icon: Subscript },
            { format: 'superscript', icon: Superscript },
            { format: 'code', icon: Code },
          ] as const
        ).map(({ format, icon }) => (
          <ToolbarAction
            key={format}
            label={field.t[format]}
            icon={icon}
            iconOnly
            active={state.formats.includes(format)}
            onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)}
          />
        ))}
      </div>
      <div className="flex max-w-full flex-wrap gap-0.5 border-r border-border pr-1">
        {(
          [
            { align: 'left', label: 'alignLeft', icon: AlignLeft },
            { align: 'center', label: 'alignCenter', icon: AlignCenter },
            { align: 'right', label: 'alignRight', icon: AlignRight },
            { align: 'justify', label: 'alignJustify', icon: AlignJustify },
          ] as const
        ).map(({ align, label, icon }) => (
          <ToolbarAction
            key={align}
            label={field.t[label]}
            icon={icon}
            iconOnly
            active={state.align === align || (align === 'left' && state.align === '')}
            onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, align)}
          />
        ))}
        <ToolbarAction
          label={field.t.indent}
          icon={IndentIncrease}
          iconOnly
          disabled={state.indent >= fieldEditorPolicy.richTextMaxIndent}
          onClick={() => editor.dispatchCommand(INDENT_CONTENT_COMMAND)}
        />
        <ToolbarAction
          label={field.t.outdent}
          icon={IndentDecrease}
          iconOnly
          disabled={state.indent === 0}
          onClick={() => editor.dispatchCommand(OUTDENT_CONTENT_COMMAND)}
        />
      </div>
    </>
  );
}

function RichTextBlocks({ state }: { state: ToolbarState }) {
  const [editor] = useLexicalComposerContext();
  const field = useFields();
  function block(kind: 'paragraph' | 'heading' | 'quote', level = 2) {
    editor.dispatchCommand(REMOVE_LIST_COMMAND);
    editor.update(() => {
      const current = $getSelection();
      const selected = $isRangeSelection(current) ? current : $getRoot().selectEnd();
      $setBlocksType(selected, () =>
        kind === 'heading'
          ? $createHeadingNode(headingTag(level))
          : kind === 'quote'
            ? $createQuoteNode()
            : $createParagraphNode(),
      );
    });
  }
  function list(kind: ListType) {
    editor.update(() => {
      if (!$isRangeSelection($getSelection())) $getRoot().selectEnd();
      if (state.block === 'list' && state.kind === kind)
        editor.dispatchCommand(REMOVE_LIST_COMMAND);
      else
        editor.dispatchCommand(
          kind === 'number'
            ? INSERT_ORDERED_LIST_COMMAND
            : kind === 'check'
              ? INSERT_CHECK_LIST_COMMAND
              : INSERT_UNORDERED_LIST_COMMAND,
        );
    });
  }
  return (
    <div className="flex max-w-full flex-wrap gap-0.5 border-r border-border pr-1">
      <ToolbarAction
        label={field.t.paragraph}
        icon={Pilcrow}
        active={state.block === 'paragraph'}
        onClick={() => block('paragraph')}
      />
      <ToolbarAction
        label={field.t.heading}
        icon={Heading2}
        active={state.block === 'heading'}
        onClick={() => block('heading')}
      />
      <NativeSelect
        aria-label={field.t.headingLevel}
        value={state.level}
        onChange={(event) => block('heading', Number(event.currentTarget.value))}
        className="w-18"
      >
        {[1, 2, 3, 4, 5, 6].map((level) => (
          <option key={level} value={level}>
            H{level}
          </option>
        ))}
      </NativeSelect>
      <ToolbarAction
        label={field.t.list}
        icon={List}
        active={state.block === 'list' && state.kind === 'bullet'}
        onClick={() => list('bullet')}
      />
      <ToolbarAction
        label={field.t.orderedList}
        icon={ListOrdered}
        iconOnly
        active={state.block === 'list' && state.kind === 'number'}
        onClick={() => list('number')}
      />
      <ToolbarAction
        label={field.t.checkList}
        icon={ListChecks}
        iconOnly
        active={state.block === 'list' && state.kind === 'check'}
        onClick={() => list('check')}
      />
      <ToolbarAction
        label={field.t.quote}
        icon={TextQuote}
        iconOnly
        active={state.block === 'quote'}
        onClick={() => block('quote')}
      />
      <ToolbarAction
        label={field.t.horizontalRule}
        icon={Minus}
        iconOnly
        onClick={() => {
          editor.update(() => {
            if (!$isRangeSelection($getSelection())) $getRoot().selectEnd();
          });
          editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND);
        }}
      />
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
  const collections = field.services.collections.filter((entry) =>
    picker?.kind === 'media'
      ? entry.upload === true
      : picker?.kind === 'internalLink'
        ? entry.richTextLink !== false
        : entry.richTextRelationship !== false,
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
    if (!picker) return;
    const [reference] = selection;
    if (
      picker.kind !== 'link' &&
      (!reference || !collections.some((entry) => entry.id === reference.collection))
    )
      return;
    const label = reference
      ? `${collections.find((entry) => entry.id === reference.collection)?.label ?? reference.collection} / ${reference.id}`
      : '';
    if (!applyRichTextPick(editor, { picker, reference, url, label })) return;
    setPicker(null);
    editor.focus();
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
        <RichTextFormats state={state} />
        <RichTextBlocks state={state} />
        <div className="flex flex-wrap gap-0.5">
          {(
            [
              { kind: 'link', icon: Link2 },
              { kind: 'internalLink', icon: FileSearch },
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
              {...(picker?.kind === 'internalLink' || picker?.kind === 'relationship'
                ? { context: 'admin' as const }
                : {})}
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
