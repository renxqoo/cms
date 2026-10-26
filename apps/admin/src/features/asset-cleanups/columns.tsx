import { Button } from '@new-cms/ui/actions';
import type { CleanupEntry } from '../../contracts/cleanups';
import { workTime } from '../jobs/work-values';
import type { cleanupMessages } from './messages';

export function createCleanupColumns({
  t,
  locale,
  canRead,
  open,
}: {
  t: (typeof cleanupMessages)['en' | 'zh'];
  locale: 'en' | 'zh';
  canRead: boolean;
  open: (id: string) => void;
}) {
  return [
    {
      key: 'id',
      header: t.id,
      cell: (row: CleanupEntry) => <span className="font-mono text-xs">{row.id}</span>,
    },
    { key: 'state', header: t.state, cell: (row: CleanupEntry) => t[row.state] },
    {
      key: 'blocked',
      header: t.blocked,
      cell: (row: CleanupEntry) => (row.blocked ? t.yes : t.no),
    },
    { key: 'attempts', header: t.attempts, cell: (row: CleanupEntry) => row.attempts },
    {
      key: 'next',
      header: t.next,
      cell: (row: CleanupEntry) => workTime(row.nextCleanupAt, locale),
    },
    {
      key: 'details',
      header: t.details,
      cell: (row: CleanupEntry) => (
        <Button variant="ghost" size="sm" disabled={!canRead} onClick={() => open(row.id)}>
          {t.details}
        </Button>
      ),
    },
  ];
}
