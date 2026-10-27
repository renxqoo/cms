import {
  createState,
  $getState,
  $setState,
  $getSelection,
  $isRangeSelection,
  $createTextNode,
} from 'lexical';
import { $createLinkNode, $isLinkNode, $toggleLink } from '@lexical/link';
import { z } from 'zod';
import type { LinkNode } from '@lexical/link';
import type { ReferenceValue } from './types';

const referenceSchema = z.strictObject({
  collection: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  id: z.uuid(),
});
const referenceState = createState('cmsInternalDocument', {
  parse(value: unknown): ReferenceValue | null {
    const parsed = referenceSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  },
});
function documentAnchor(reference: ReferenceValue): string {
  return `#cms-document:${reference.collection}/${reference.id}`;
}
export function $createInternalDocumentLink(reference: ReferenceValue): LinkNode {
  const node = $createLinkNode(documentAnchor(reference));
  $setState(node, referenceState, { ...reference });
  return node;
}
export function $internalDocumentReference(node: LinkNode): ReferenceValue | null {
  const reference = $getState(node, referenceState);
  return reference && node.getURL() === documentAnchor(reference) ? reference : null;
}
export function $insertInternalDocumentLink(reference: ReferenceValue, label: string): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;
  if (selection.isCollapsed()) {
    const link = $createInternalDocumentLink(reference);
    link.append($createTextNode(label));
    selection.insertNodes([link]);
    link.selectEnd();
    return;
  }
  $toggleLink(documentAnchor(reference));
  const links = new Set(
    selection.getNodes().flatMap((node) => [node, ...node.getParents()].filter($isLinkNode)),
  );
  for (const node of links)
    if (node.getURL() === documentAnchor(reference))
      $setState(node, referenceState, { ...reference });
}
