import { Button } from '@new-cms/ui/actions';
import { Pill } from '@new-cms/ui/feedback';
import type { DataTableColumn } from '@new-cms/ui/data';
import type { Credential } from '../../contracts/credentials';
import { credentialMessages } from './credential-messages';
import { grantKey } from './resource-permission-model';

export function credentialColumns({
  kind,
  locale,
  onRevoke,
}: {
  kind: Credential['kind'];
  locale: 'zh' | 'en';
  onRevoke: (target: { credential: Credential; all: boolean }) => void;
}): DataTableColumn<Credential>[] {
  const t = credentialMessages[locale];
  const date = (value: string) => new Date(value).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en');
  return [
    {
      key: 'name',
      header: t.name,
      cell: (row) => (
        <div className="min-w-36 max-w-64 space-y-1">
          <p className="font-medium break-all">{row.name}</p>
          <p className="font-mono text-xs break-all text-muted-foreground">
            {row.prefix ?? row.clientName ?? row.clientId}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: t.status,
      cell: (row) => (
        <Pill
          tone={
            row.status === 'active' ? 'success' : row.status === 'expired' ? 'warning' : 'neutral'
          }
        >
          {t[row.status]}
        </Pill>
      ),
    },
    { key: 'resource', header: t.resource, cell: (row) => row.resource.toUpperCase() },
    {
      key: 'grants',
      header: t.permissions,
      cell: (row) => (
        <details className="max-w-72">
          <summary className="cursor-pointer whitespace-nowrap rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t.permissions} ({row.grants.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {row.grants.map((grant) => (
              <li key={grantKey(grant)} className="text-xs break-all">
                {grant.collectionKey ?? t.system} · {grant.operationId}
              </li>
            ))}
          </ul>
        </details>
      ),
    },
    {
      key: 'createdAt',
      header: t.created,
      cell: (row) => <span className="whitespace-nowrap">{date(row.createdAt)}</span>,
    },
    {
      key: 'expiresAt',
      header: t.expires,
      cell: (row) => <span className="whitespace-nowrap">{date(row.expiresAt)}</span>,
    },
    {
      key: 'lastUsedAt',
      header: t.lastUsed,
      cell: (row) =>
        row.lastUsedAt ? (
          <span className="whitespace-nowrap">{date(row.lastUsedAt)}</span>
        ) : (
          t.never
        ),
    },
    {
      key: 'actions',
      header: t.actions,
      cell: (row) => (
        <div className="flex min-w-32 flex-col gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={row.status !== 'active'}
            onClick={() => onRevoke({ credential: row, all: false })}
          >
            {kind === 'api_key' ? t.revokeKey : t.revokeLogin}
          </Button>
          {kind === 'oauth' && row.clientId ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-auto whitespace-normal"
              onClick={() => onRevoke({ credential: row, all: true })}
            >
              {t.revokeClient}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];
}
