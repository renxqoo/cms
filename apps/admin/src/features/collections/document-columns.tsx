import { Button } from '@new-cms/ui/actions';
import { RegisteredCell } from '../admin-components/renderers';
import { fieldValue } from '../fields/data';
import { Checkbox } from '@new-cms/ui/forms';
import type { DataTableColumn } from '@new-cms/ui/data';
import { DateCell, StatusCell } from '@new-cms/ui/data';
import type { Collection } from '../../contracts/content';
import type { Document } from '../../contracts/documents';
import type { ContentMessages } from './messages';
import { displayField, documentTitle } from './query';
import { documentStatus } from './document-status';
import { DocumentThumbnail } from './document-thumbnail';

interface ColumnOptions {
  collection: Collection;
  t: ContentMessages;
  locale: 'zh' | 'en';
  selected: readonly Document[];
  select: (document: Document, checked: boolean) => void;
  visible: readonly string[];
  trashed: boolean;
  open: (id: string) => void;
  trash: (document: Document, action: 'restore' | 'purge') => void;
  canRestore: boolean;
  canPurge: boolean;
  mode?: string;
  contentLocale?: string;
}

export function defaultVisibleFields(collection: Collection) {
  if (collection.admin?.defaultColumns)
    return collection.admin.defaultColumns.filter((path) =>
      collection.fields.some((field) => field.path === path && !field.disabled?.column),
    );
  const title = collection.fields.find((field) =>
    ['text', 'textarea', 'email'].includes(field.type),
  );
  return collection.fields
    .filter(
      (field) =>
        !field.disabled?.column &&
        field.path !== title?.path &&
        ['text', 'textarea', 'email', 'number', 'boolean', 'date', 'select'].includes(field.type),
    )
    .slice(0, 3)
    .map((field) => field.path);
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
    .filter((field) => !field.disabled?.column && options.visible.includes(field.path))
    .map((field) => ({
      key: `field:${field.path}`,
      header: field.label,
      sortable: field.queryable && field.sortable,
      cell: (document) => (
        <RegisteredCell
          collection={options.collection}
          field={field}
          document={document}
          text={displayField(document, field.path, field.type)}
          value={fieldValue(document.data, field.path.split('.'))}
        >
          <span
            className="block max-w-64 truncate"
            title={displayField(document, field.path, field.type)}
          >
            {displayField(document, field.path, field.type)}
          </span>
        </RegisteredCell>
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
          hideLabel
          label={`${t.select} ${documentTitle(document, collection)}`}
          checked={options.selected.some((item) => item.id === document.id)}
          onCheckedChange={(checked) => options.select(document, checked)}
        />
      ),
    },
    {
      key: 'title',
      header: t.name,
      cell: (document) => (
        <div className="flex items-center gap-3">
          <DocumentThumbnail
            collection={collection}
            document={document}
            locale={options.contentLocale ?? collection.defaultLocale}
            mode={options.mode === 'published' ? 'published' : 'editing'}
          />
          <DocumentTitleCell options={options} document={document} />
        </div>
      ),
    },
    ...fieldColumns(options),
    { key: 'revision', header: t.revision, sortable: true, cell: (document) => document.revision },
    {
      key: 'updatedAt',
      header: t.updatedAt,
      sortable: true,
      cell: (document) => (
        <DateCell
          value={document.updatedAt}
          format={(date) =>
            new Intl.DateTimeFormat(options.locale === 'zh' ? 'zh-CN' : 'en', {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(date)
          }
          emptyLabel="—"
          errorLabel={t.unknownTime}
        />
      ),
    },
    {
      key: 'status',
      header: t.status,
      cell: (document) => {
        const status = documentStatus(document, collection, {
          t,
          ...(options.mode ? { mode: options.mode } : {}),
        });
        return <StatusCell tone={status.tone}>{status.label}</StatusCell>;
      },
    },
    ...(options.trashed
      ? [
          {
            key: 'actions',
            header: t.confirm,
            cell: (document: Document) => trashButtons(options, document),
          },
        ]
      : []),
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

function DocumentTitleCell({ options, document }: { options: ColumnOptions; document: Document }) {
  const title = documentTitle(document, options.collection);
  if (document.adminURL === null || (document.adminURL === undefined && options.trashed))
    return <span>{title}</span>;
  if (document.adminURL !== undefined)
    return (
      <Button variant="link" render={<a href={document.adminURL} />}>
        {title}
      </Button>
    );
  return (
    <Button variant="link" onClick={() => options.open(document.id)}>
      {title}
    </Button>
  );
}
