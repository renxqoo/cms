'use client';

import { z } from 'zod';
import { createContext, use } from 'react';
import type { ReactNode } from 'react';
import { $applyNodeReplacement, $isRootNode, DecoratorNode } from 'lexical';
import type { LexicalNode, NodeKey, SerializedLexicalNode, SerializedPartial } from 'lexical';
import { useFields } from './field-context';
import type { FieldLocation, ReferenceValue } from './types';

export const RichLocation = createContext<FieldLocation | null>(null);

type ReferenceKind = 'relationship' | 'media';
interface SerializedReference extends SerializedLexicalNode, ReferenceValue {
  kind: ReferenceKind;
}
const serializedReference = z.object({
  kind: z.enum(['relationship', 'media']),
  collection: z.string(),
  id: z.uuid(),
});

function ReferencePreview({
  reference,
  kind,
  indices,
}: {
  reference: ReferenceValue;
  kind: ReferenceKind;
  indices: number[];
}) {
  const field = useFields();
  const location = use(RichLocation);
  const suffix = indices.flatMap((index) => ['children', index]);
  return (
    <span
      className="my-1 inline-flex max-w-full flex-col rounded-lg border bg-muted/30 p-2 text-xs"
      contentEditable={false}
    >
      <span className="break-all">
        {kind === 'media' ? field.t.media : field.t.relationship}: {reference.collection} /{' '}
        {reference.id}
      </span>
      {kind === 'media' && location
        ? field.services.renderPreview?.({
            reference,
            path: [...location.path, ...suffix],
            sourcePath: `${field.locale}:${[location.sourcePath, ...suffix].join('.')}`,
          })
        : null}
    </span>
  );
}

function referenceIndices(node: LexicalNode) {
  const indices: number[] = [];
  let current: LexicalNode | null = node;
  while (current && !$isRootNode(current)) {
    indices.unshift(current.getIndexWithinParent());
    current = current.getParent();
  }
  return indices;
}

export class CmsReferenceNode extends DecoratorNode<ReactNode> {
  referenceValue: ReferenceValue;
  referenceKind: ReferenceKind;

  static override getType() {
    return 'cms-reference';
  }
  static override clone(node: CmsReferenceNode) {
    return new CmsReferenceNode({
      reference: node.referenceValue,
      kind: node.referenceKind,
      key: node.getKey(),
    });
  }
  static override importJSON(
    value: SerializedPartial<SerializedLexicalNode> & Record<string, unknown>,
  ) {
    const parsed = serializedReference.parse(value);
    return $createCmsReference({
      kind: parsed.kind,
      reference: { collection: parsed.collection, id: parsed.id },
    });
  }
  constructor(input: { reference: ReferenceValue; kind: ReferenceKind; key?: NodeKey }) {
    super(input.key);
    this.referenceValue = { ...input.reference };
    this.referenceKind = input.kind;
  }
  override exportJSON(): SerializedReference {
    return {
      ...super.exportJSON(),
      type: 'cms-reference',
      version: 1,
      kind: this.referenceKind,
      ...this.referenceValue,
    };
  }
  override createDOM() {
    return document.createElement('span');
  }
  override updateDOM() {
    return false;
  }
  override isInline() {
    return true;
  }
  override decorate() {
    return (
      <ReferencePreview
        reference={this.referenceValue}
        kind={this.referenceKind}
        indices={referenceIndices(this)}
      />
    );
  }
  reference() {
    return { ...this.getLatest().referenceValue };
  }
  kind() {
    return this.getLatest().referenceKind;
  }
}

export function $createCmsReference(input: { reference: ReferenceValue; kind: ReferenceKind }) {
  return $applyNodeReplacement(new CmsReferenceNode(input));
}
