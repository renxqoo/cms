import type { DataTableColumn } from '@new-cms/ui/data';
import { AppLink } from '../../components/shell/navigation/app-link';
import type { Collection, Document } from '../../contracts/content';
import { documentPath } from './content-policy';
import { pathValue, cellValue, documentTitle } from './document-label';
import { TrashActions } from './trash-actions';
import type { ContentQuery } from './content-query';
import type { ContentMessages } from './content-messages';
export function documentColumnOptions(collection: Collection, t: ContentMessages) {
  return [
    { key: 'id', label: t.id },
    ...collection.fields.map((field) => ({ key: field.path, label: field.label })),
    { key: 'revision', label: t.revision },
    { key: 'createdAt', label: t.createdAt },
    { key: 'updatedAt', label: t.updatedAt },
  ];
}
export function contentColumns(input: {
  collection: Collection;
  query: ContentQuery;
  canRead: boolean;
  onChanged: () => void;
  messages: ContentMessages;
}): DataTableColumn<Document>[] {
  const { collection, query, canRead, onChanged, messages: t } = input;
  const columns: DataTableColumn<Document>[] = documentColumnOptions(collection, t)
    .filter((option) => query.columns.includes(option.key))
    .map((option) => ({
      key: option.key,
      header: option.label,
      sortable:
        ['id', 'revision', 'createdAt', 'updatedAt'].includes(option.key) ||
        collection.fields.some((field) => field.path === option.key && field.queryable),
      cell: (document) =>
        option.key === 'id' ? (
          canRead && !query.trashed ? (
            <AppLink
              href={documentPath(collection.key, document.id, query.locale)}
              className="font-medium text-primary underline underline-offset-4"
            >
              {documentTitle(document, collection)}
            </AppLink>
          ) : (
            <span className="font-mono text-xs">{document.id}</span>
          )
        ) : (
          <span className="line-clamp-3 max-w-80 break-words">
            {cellValue(documentCell(document, option.key))}
          </span>
        ),
    }));
  if (query.trashed)
    columns.push({
      key: 'actions',
      header: t.action,
      cell: (document) => <TrashActions document={document} onChanged={onChanged} messages={t} />,
    });
  return columns;
}
function documentCell(document: Document, key: string) {
  if (key === 'revision') return document.revision;
  if (key === 'createdAt') return document.createdAt;
  if (key === 'updatedAt') return document.updatedAt;
  return pathValue(document.data, key);
}
