import { $getRoot, $getSelection, $isRangeSelection, $setSelection } from 'lexical';
import type { LexicalEditor, RangeSelection } from 'lexical';
import { TOGGLE_LINK_COMMAND } from '@lexical/link';
import { $createCmsReference } from './rich-text-reference';
import { $insertInternalDocumentLink } from './rich-text-internal-link';
import { safeRichTextLink } from './rich-text-value';
import type { ReferenceValue } from './types';

export interface RichTextPicker {
  kind: 'relationship' | 'media' | 'link' | 'internalLink';
  selection: RangeSelection | null;
}
export function applyRichTextPick(
  editor: LexicalEditor,
  input: {
    picker: RichTextPicker;
    reference: ReferenceValue | undefined;
    url: string;
    label: string;
  },
): boolean {
  const { picker, reference, url } = input;
  if (picker.kind === 'link' ? !safeRichTextLink(url) : !reference) return false;
  editor.update(() => {
    if (picker.selection) $setSelection(picker.selection);
    else $getRoot().selectEnd();
    if (picker.kind === 'link') editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
    else if (reference && picker.kind === 'internalLink')
      $insertInternalDocumentLink(reference, input.label);
    else if (reference) {
      const selected = $getSelection();
      if ($isRangeSelection(selected))
        selected.insertNodes([
          $createCmsReference({
            kind: picker.kind === 'media' ? 'media' : 'relationship',
            reference,
          }),
        ]);
    }
  });
  return true;
}
