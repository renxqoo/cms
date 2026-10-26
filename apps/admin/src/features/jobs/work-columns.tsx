import { Button } from '@new-cms/ui/actions';
import type { DataTableColumn } from '@new-cms/ui/data';
import type { JobSummary, UploadSummary } from '../../contracts/assets';
import type { AssetMessages } from '../assets/messages';
import { assetDate, workAction, workStatus } from './work-copy';

interface WorkColumnsInput {
  t: AssetMessages;
  locale: 'zh' | 'en';
  open: (id: string) => void;
}

export function jobColumns({ t, locale, open }: WorkColumnsInput): DataTableColumn<JobSummary>[] {
  return [
    {
      key: 'id',
      header: t.jobId,
      cell: (row) => (
        <Button
          variant="link"
          className="max-w-64 justify-start whitespace-normal break-all text-left"
          onClick={() => open(row.id)}
        >
          {row.id}
        </Button>
      ),
    },
    { key: 'action', header: t.action, cell: (row) => workAction(row.action, t) },
    { key: 'status', header: t.status, cell: (row) => workStatus(row.status, t) },
    { key: 'createdAt', header: t.createdAt, cell: (row) => assetDate(row.createdAt, locale) },
    { key: 'documentId', header: t.documentId, cell: (row) => row.documentId ?? '—' },
  ];
}

export function uploadColumns({
  t,
  locale,
  open,
}: WorkColumnsInput): DataTableColumn<UploadSummary>[] {
  return [
    {
      key: 'filename',
      header: t.filename,
      cell: (row) => (
        <Button
          variant="link"
          className="max-w-64 justify-start whitespace-normal break-all text-left"
          onClick={() => open(row.id)}
        >
          {row.filename}
        </Button>
      ),
    },
    { key: 'id', header: t.uploadId, cell: (row) => row.id },
    { key: 'status', header: t.status, cell: (row) => workStatus(row.status, t) },
    {
      key: 'purpose',
      header: t.purpose,
      cell: (row) => (row.purpose === 'replace' ? t.replace : t.createDocument),
    },
    { key: 'expiresAt', header: t.expires, cell: (row) => assetDate(row.expiresAt, locale) },
  ];
}
