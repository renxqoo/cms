import { Button } from '@new-cms/ui/actions';
import { DateCell } from '@new-cms/ui/data';
import type { Audit } from '../../contracts/access';
import { auditDate } from './audit-query';
import { auditMessages } from './audit-messages';

export function createAuditColumns({
  locale,
  open,
}: {
  locale: 'zh' | 'en';
  open: (record: Audit) => void;
}) {
  const t = auditMessages[locale];
  return [
    {
      key: 'createdAt',
      header: t.time,
      sortable: true,
      cell: (record: Audit) => (
        <DateCell
          value={record.createdAt}
          format={(date) => auditDate(date, locale)}
          emptyLabel="—"
          errorLabel={t.invalid}
        />
      ),
    },
    { key: 'actor', header: t.actor, cell: (record: Audit) => record.actorId ?? t.system },
    {
      key: 'operationId',
      header: t.operation,
      cell: (record: Audit) => <span className="font-mono text-xs">{record.operationId}</span>,
    },
    {
      key: 'target',
      header: t.target,
      cell: (record: Audit) => (
        <span className="font-mono text-xs">
          {record.targetType} · {record.targetId ?? '—'}
        </span>
      ),
    },
    {
      key: 'requestId',
      header: t.requestId,
      cell: (record: Audit) => <span className="font-mono text-xs">{record.requestId}</span>,
    },
    {
      key: 'actions',
      header: t.actions,
      cell: (record: Audit) => (
        <Button variant="ghost" size="sm" onClick={() => open(record)}>
          {t.detail}
        </Button>
      ),
    },
  ];
}
