import type { DataTableColumn } from '@new-cms/ui/data';
import { AppLink } from '../../components/shell/navigation/app-link';
import type { CoverageRow } from './catalog';

export function createCoverageColumns(
  copy: (key: string) => string,
): readonly DataTableColumn<CoverageRow>[] {
  return [
    { key: 'category', header: copy('category'), cell: (row) => copy(`${row.category}Title`) },
    {
      key: 'guide',
      header: copy('guide'),
      cell: (row) => <span className="font-medium">{row.guide}</span>,
    },
    {
      key: 'scenario',
      header: copy('scenario'),
      cell: (row) => (
        <AppLink
          href={`/ui/${row.scenario}`}
          prefetch={false}
          className="rounded-sm underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copy(`${row.scenario}Title`)}
        </AppLink>
      ),
    },
  ];
}
