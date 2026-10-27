'use client';

import { useShell } from '../../components/shell/shell-provider';
import { ModelField } from './model-field';
import type {
  FieldComponentProps,
  CellComponentProps,
  CollectionComponentProps,
  AdminComponentRegistry,
} from './types';

function CharacterCount({ value, node, children }: FieldComponentProps) {
  const language = useShell((state) => state.locale);
  const count =
    typeof value === 'string'
      ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)).length
      : 0;
  return (
    <>
      {children}
      <span className="block text-xs text-muted-foreground" aria-live="polite">
        {count}
        {node.constraints.maxLength === undefined ? '' : ` / ${node.constraints.maxLength}`}{' '}
        {language === 'zh' ? '个字符' : 'characters'}
      </span>
    </>
  );
}

function MonospaceCell({ text }: CellComponentProps) {
  return <span className="font-mono text-xs">{text}</span>;
}

function CollectionSection({ collection, children }: CollectionComponentProps) {
  return (
    <section aria-label={collection.label} className="space-y-6">
      {children ?? (
        <p className="text-sm text-muted-foreground">
          {collection.admin?.description ?? collection.label}
        </p>
      )}
    </section>
  );
}

const section = { 'cms/section': CollectionSection };

export const builtinAdminComponents: AdminComponentRegistry = Object.freeze({
  versions: {
    'cms/character-count': '1',
    'cms/monospace': '1',
    'cms/section': '1',
    'cms/model-field': '1',
  },
  fields: {
    Field: { 'cms/character-count': CharacterCount, 'cms/model-field': ModelField },
    Description: { 'cms/character-count': CharacterCount },
    afterInput: { 'cms/character-count': CharacterCount },
  },
  cells: { 'cms/monospace': MonospaceCell },
  collections: {
    Header: section,
    List: section,
    Edit: section,
    beforeList: section,
    afterList: section,
    beforeEdit: section,
    afterEdit: section,
  },
});
