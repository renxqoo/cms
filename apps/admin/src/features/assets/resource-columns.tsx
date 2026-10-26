import { Button } from '@new-cms/ui/actions';
import type { DataTableColumn } from '@new-cms/ui/data';
import type { Collection, Document } from '../../contracts/content';
import type { AssetMessages } from './messages';
import { assetDate } from '../jobs/work-copy';

export function resourceColumns({
  t,
  locale,
  collections,
  open,
}: {
  t: AssetMessages;
  locale: 'zh' | 'en';
  collections: readonly Collection[];
  open: (resource: Document) => void;
}): DataTableColumn<Document>[] {
  return [
    {
      key: 'filename',
      header: t.filename,
      cell: (row) => (
        <Button
          variant="link"
          className="max-w-72 justify-start whitespace-normal break-all text-left"
          onClick={() => open(row)}
        >
          {row.file?.filename ?? row.id}
        </Button>
      ),
    },
    {
      key: 'collection',
      header: t.collection,
      cell: (row) =>
        collections.find((collection) => collection.key === row.collection)?.label ??
        row.collection,
    },
    { key: 'mimeType', header: t.mimeType, cell: (row) => row.file?.mimeType ?? '—' },
    {
      key: 'bytes',
      header: t.bytes,
      cell: (row) => (row.file ? new Intl.NumberFormat(locale).format(row.file.bytes) : '—'),
    },
    { key: 'updatedAt', header: t.updatedAt, cell: (row) => assetDate(row.updatedAt, locale) },
  ];
}
