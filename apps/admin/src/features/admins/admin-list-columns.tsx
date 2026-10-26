import { DateCell, StatusCell } from '@new-cms/ui/data';
import type { DataTableColumn } from '@new-cms/ui/data';
import type { Admin } from '../../contracts/access';
import { AdminRowActions } from './admin-row-actions';
import type { AdminsMessages } from './admins-messages';

export function adminDate(value: Date, locale: 'zh' | 'en') {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(value);
}

export function adminColumns({
  messages: t,
  locale,
  canRead,
}: {
  messages: AdminsMessages;
  locale: 'zh' | 'en';
  canRead: boolean;
}): DataTableColumn<Admin>[] {
  return [
    {
      key: 'email',
      header: t.email,
      sortable: true,
      cell: (row) => <span className="font-medium">{row.email}</span>,
    },
    {
      key: 'displayName',
      header: t.name,
      sortable: true,
      cell: (row) => row.displayName ?? t.unset,
    },
    {
      key: 'roleCode',
      header: t.role,
      cell: (row) => <StatusCell tone="neutral">{row.roleCode}</StatusCell>,
    },
    {
      key: 'status',
      header: t.status,
      cell: (row) => (
        <div className="flex items-center gap-2">
          <StatusCell tone={row.status === 'active' ? 'success' : 'neutral'}>
            {t[row.status]}
          </StatusCell>
          {row.status === 'active' && row.activation === 'pending' ? (
            <StatusCell tone="warning">{t.pending}</StatusCell>
          ) : null}
        </div>
      ),
    },
    {
      key: 'lastLoginAt',
      header: t.lastLogin,
      sortable: true,
      cell: (row) => (
        <DateCell
          value={row.lastLoginAt}
          format={(date) => adminDate(date, locale)}
          emptyLabel={t.never}
          errorLabel={t.unknownTime}
        />
      ),
    },
    {
      key: 'createdAt',
      header: t.createdAt,
      sortable: true,
      cell: (row) => (
        <DateCell
          value={row.createdAt}
          format={(date) => adminDate(date, locale)}
          emptyLabel={t.unset}
          errorLabel={t.unknownTime}
        />
      ),
    },
    {
      key: 'actions',
      header: t.actions,
      cell: (row) => (
        <AdminRowActions id={row.id} email={row.email} canRead={canRead} messages={t} />
      ),
    },
  ];
}
