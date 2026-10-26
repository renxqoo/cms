import { Button } from '@new-cms/ui/actions';
import { Checkbox } from '@new-cms/ui/forms';
import type { DataTableColumn } from '@new-cms/ui/data';
import type { Collection } from '../../contracts/content';
import type { Document } from '../../contracts/documents';
import type { ContentMessages } from './messages';
import { displayField, documentTitle } from './query';

interface ColumnOptions {
  collection: Collection;
  t: ContentMessages;
  selected: readonly Document[];
  select: (document: Document, checked: boolean) => void;
  visible: readonly string[];
  trashed: boolean;
  open: (id: string) => void;
  trash: (document: Document, action: 'restore' | 'purge') => void;
  canRestore: boolean;
  canPurge: boolean;
}

function rowStatus(document: Document, t: ContentMessages) {
  if (document.trashedAt) return t.trash;
  return document.publishedVersionId ? t.publishedStatus : t.draft;
}

function trashButtons(options: ColumnOptions, document: Document) {
  if (!options.trashed) return null;
  return (
    <div className="flex gap-2">
      {options.canRestore ? (
        <Button variant="outline" size="sm" onClick={() => options.trash(document, 'restore')}>
          {options.t.restore}
        </Button>
      ) : null}
      {options.canPurge ? (
        <Button variant="destructive" size="sm" onClick={() => options.trash(document, 'purge')}>
          {options.t.purge}
        </Button>
      ) : null}
    </div>
  );
}

function fieldColumns(options: ColumnOptions): DataTableColumn<Document>[] {
  return options.collection.fields
    .filter((field) => options.visible.includes(field.path))
    .map((field) => ({
      key: `field:${field.path}`,
      header: field.label,
      sortable: field.queryable,
      cell: (document) => (
        <span className="block max-w-64 truncate" title={displayField(document, field.path)}>
          {displayField(document, field.path)}
        </span>
      ),
    }));
}

export function documentColumns(options: ColumnOptions): DataTableColumn<Document>[] {
  const { t, collection } = options;
  return [
    {
      key: 'selection',
      header: t.select,
      cell: (document) => (
        <Checkbox
          label={`${t.select} ${documentTitle(document, collection)}`}
          checked={options.selected.some((item) => item.id === document.id)}
          onCheckedChange={(checked) => options.select(document, checked)}
        />
      ),
    },
    {
      key: 'title',
      header: t.name,
      cell: (document) =>
        options.trashed ? (
          <span>{documentTitle(document, collection)}</span>
        ) : (
          <Button variant="link" onClick={() => options.open(document.id)}>
            {documentTitle(document, collection)}
          </Button>
        ),
    },
    ...fieldColumns(options),
    { key: 'revision', header: t.revision, sortable: true, cell: (document) => document.revision },
    {
      key: 'updatedAt',
      header: t.updatedAt,
      sortable: true,
      cell: (document) => <time dateTime={document.updatedAt}>{document.updatedAt}</time>,
    },
    { key: 'status', header: t.status, cell: (document) => rowStatus(document, t) },
    { key: 'actions', header: t.confirm, cell: (document) => trashButtons(options, document) },
  ];
}

export function selectedDocuments(
  previous: readonly Document[],
  document: Document,
  checked: boolean,
) {
  if (!checked) return previous.filter((item) => item.id !== document.id);
  return previous.some((item) => item.id === document.id) ? [...previous] : [...previous, document];
}
