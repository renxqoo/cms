import { PencilIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import type { DataTableColumn } from '@new-cms/ui/data';
import { Pill } from '@new-cms/ui/feedback';
import type { Locale } from '../../config/preferences';
import type { ExampleDocument } from './list-data';
import { formatUtcTimestamp } from './format-date';

interface ColumnLabels {
  title: string;
  category: string;
  status: string;
  updatedAt: string;
  actions: string;
  edit: string;
  draft: string;
  published: string;
}

export function createListColumns({
  locale,
  labels,
  onEdit,
}: {
  locale: Locale;
  labels: ColumnLabels;
  onEdit: (row: ExampleDocument) => void;
}): readonly DataTableColumn<ExampleDocument>[] {
  return [
    {
      key: 'title',
      header: labels.title,
      sortable: true,
      cell: (row) => <span className="font-medium">{row.title[locale]}</span>,
    },
    {
      key: 'category',
      header: labels.category,
      cell: (row) => <span className="text-muted-foreground">{row.category[locale] || '—'}</span>,
    },
    {
      key: 'status',
      header: labels.status,
      cell: (row) => (
        <Pill tone={row.status === 'published' ? 'success' : 'neutral'}>{labels[row.status]}</Pill>
      ),
    },
    {
      key: 'updatedAt',
      header: labels.updatedAt,
      sortable: true,
      cell: (row) => (
        <time
          dateTime={row.updatedAt}
          title="UTC"
          className="whitespace-nowrap text-muted-foreground"
        >
          {formatUtcTimestamp(row.updatedAt)}
        </time>
      ),
    },
    {
      key: 'actions',
      header: labels.actions,
      cell: (row) => (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${labels.edit} · ${row.title[locale]}`}
          onClick={() => onEdit(row)}
        >
          <PencilIcon />
        </Button>
      ),
    },
  ];
}
