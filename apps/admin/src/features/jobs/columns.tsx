import { Button } from '@new-cms/ui/actions';
import type { JobSummary, UploadSummary } from '../../contracts/jobs';
import { workStatus } from './messages';
import type { WorkMessages } from './messages';
import { workTime } from './work-values';

export function createJobColumns({
  t,
  locale,
  canRead,
  open,
}: {
  t: WorkMessages;
  locale: 'zh' | 'en';
  canRead: boolean;
  open: (row: JobSummary) => void;
}) {
  return [
    {
      key: 'id',
      header: t.id,
      cell: (row: JobSummary) => <span className="font-mono text-xs">{row.id}</span>,
    },
    { key: 'action', header: t.action, cell: (row: JobSummary) => t[row.action] },
    { key: 'status', header: t.status, cell: (row: JobSummary) => workStatus(row.status, t) },
    {
      key: 'created',
      header: t.created,
      cell: (row: JobSummary) => workTime(row.createdAt, locale),
    },
    {
      key: 'details',
      header: t.details,
      cell: (row: JobSummary) => (
        <Button variant="ghost" size="sm" disabled={!canRead} onClick={() => open(row)}>
          {t.details}
        </Button>
      ),
    },
  ];
}

export function createUploadColumns({
  t,
  locale,
  canRead,
  open,
}: {
  t: WorkMessages;
  locale: 'zh' | 'en';
  canRead: boolean;
  open: (row: UploadSummary) => void;
}) {
  return [
    { key: 'filename', header: t.filename, cell: (row: UploadSummary) => row.filename },
    { key: 'purpose', header: t.purpose, cell: (row: UploadSummary) => t[row.purpose] },
    {
      key: 'status',
      header: t.status,
      cell: (row: UploadSummary) => workStatus(row.status, t),
    },
    {
      key: 'expires',
      header: t.expires,
      cell: (row: UploadSummary) => workTime(row.expiresAt, locale),
    },
    {
      key: 'details',
      header: t.details,
      cell: (row: UploadSummary) => (
        <Button variant="ghost" size="sm" disabled={!canRead} onClick={() => open(row)}>
          {t.details}
        </Button>
      ),
    },
  ];
}
