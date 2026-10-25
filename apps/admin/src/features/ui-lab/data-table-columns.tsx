import { MoreHorizontalIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import {
  BooleanCell,
  DateCell,
  NumberCell,
  RelationshipCell,
  StatusCell,
  TextCell,
} from '@new-cms/ui/data';
import type { DataTableColumn } from '@new-cms/ui/data';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@new-cms/ui/overlays';
import { AppLink } from '../../components/shell/navigation/app-link';
import type { Locale } from '../../config/preferences';
import type { ExampleDocument } from './list-data';
import { formatUtcTimestamp } from './format-date';

export interface DataExampleRow extends ExampleDocument {
  ordinal: number;
}

export function createDataColumns({
  copy,
  locale,
  onAction,
}: {
  copy: (key: string, values?: { title: string }) => string;
  locale: Locale;
  onAction: (row: DataExampleRow) => void;
}): readonly DataTableColumn<DataExampleRow>[] {
  return [
    {
      key: 'title',
      header: copy('title'),
      sortable: true,
      cell: (row) => <TextCell value={row.title[locale]} emptyLabel={copy('missing')} />,
    },
    {
      key: 'enabled',
      header: copy('enabled'),
      cell: (row) => (
        <BooleanCell
          value={row.status === 'published'}
          trueLabel={copy('true')}
          falseLabel={copy('false')}
          emptyLabel={copy('missing')}
        />
      ),
    },
    {
      key: 'count',
      header: copy('count'),
      align: 'right',
      cell: (row) => (
        <NumberCell
          value={row.ordinal}
          format={(value) => value.toFixed(0)}
          emptyLabel={copy('missing')}
        />
      ),
    },
    {
      key: 'updatedAt',
      header: copy('updatedAt'),
      sortable: true,
      cell: (row) => (
        <DateCell
          value={row.updatedAt}
          format={(value) => formatUtcTimestamp(value.toISOString())}
          emptyLabel={copy('missing')}
          errorLabel={copy('invalidDate')}
        />
      ),
    },
    {
      key: 'status',
      header: copy('status'),
      cell: (row) => (
        <StatusCell tone={row.status === 'published' ? 'success' : 'neutral'}>
          {copy(row.status)}
        </StatusCell>
      ),
    },
    {
      key: 'relationship',
      header: copy('relationship'),
      cell: () => (
        <RelationshipCell
          label={copy('related')}
          emptyLabel={copy('missing')}
          href="/ui/documents"
          renderLink={({ href, label }) => (
            <AppLink href={href} className="underline underline-offset-2">
              {label}
            </AppLink>
          )}
        />
      ),
    },
    {
      key: 'actions',
      header: copy('actions'),
      cell: (row) => (
        <Menu>
          <MenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={copy('rowMenu', { title: row.title[locale] })}
              >
                <MoreHorizontalIcon />
              </Button>
            }
          />
          <MenuContent>
            <MenuItem onClick={() => onAction(row)}>{copy('rowAction')}</MenuItem>
          </MenuContent>
        </Menu>
      ),
    },
  ];
}
