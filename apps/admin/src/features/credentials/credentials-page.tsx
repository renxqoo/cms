'use client';

import { useId, useState } from 'react';
import { KeyRoundIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { PageHeader } from '@new-cms/ui/layout';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { useShell } from '../../components/shell/shell-provider';
import { credentialListSchema } from '../../contracts/credentials';
import type { Credential } from '../../contracts/credentials';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { ManagementList } from '../management-shared/management-list';
import { credentialMessages } from './credential-messages';
import { credentialPolicy } from './credential-policy';
import { CreateKeyDialog } from './create-key-dialog';
import { RevokeCredentialDialog } from './revoke-credential-dialog';
import { credentialColumns } from './credential-columns';

export function CredentialsPage() {
  const id = useId();
  const t = credentialMessages[useShell((state) => state.locale)];
  const [kind, setKind] = useState<Credential['kind']>('api_key');
  return (
    <ClientInteractionBoundary className="flex min-w-0 flex-col gap-4 md:gap-6">
      <PageHeader title={t.title} description={t.description} icon={<KeyRoundIcon />} />
      <div
        role="tablist"
        aria-label={t.title}
        className="flex w-fit max-w-full gap-2 rounded-lg border p-1"
      >
        {(['api_key', 'oauth'] as const).map((value) => (
          <Button
            key={value}
            id={`${id}-${value}`}
            role="tab"
            aria-selected={value === kind}
            aria-controls={`${id}-panel`}
            tabIndex={value === kind ? 0 : -1}
            variant={value === kind ? 'secondary' : 'ghost'}
            onClick={() => setKind(value)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 'api_key'
                  : event.key === 'End'
                    ? 'oauth'
                    : value === 'api_key'
                      ? 'oauth'
                      : 'api_key';
              setKind(next);
              document.getElementById(`${id}-${next}`)?.focus();
            }}
          >
            {value === 'api_key' ? t.keys : t.oauth}
          </Button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-${kind}`}
        className="min-w-0"
        tabIndex={0}
      >
        <CredentialList key={kind} kind={kind} />
      </div>
    </ClientInteractionBoundary>
  );
}

function CredentialList({ kind }: { kind: Credential['kind'] }) {
  const locale = useShell((state) => state.locale);
  const t = credentialMessages[locale];
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(credentialPolicy.pageSize);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<{ credential: Credential; all: boolean } | null>(null);
  const [notice, setNotice] = useState(false);
  const query = useApiQuery({
    operation: 'credentials.list',
    query: { kind, page, pageSize },
    response: credentialListSchema,
  });
  const columns = credentialColumns({ kind, locale, onRevoke: setRevoking });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={query.reload} disabled={query.phase === 'loading'}>
          {t.refresh}
        </Button>
        {kind === 'api_key' ? <Button onClick={() => setCreating(true)}>{t.create}</Button> : null}
      </div>
      {notice ? <Banner tone="success">{t.updated}</Banner> : null}
      <ManagementFeedback error={query.error} onRetry={query.reload} />
      <ManagementList
        columns={columns}
        rows={query.phase === 'ready' ? (query.data?.rows ?? []) : []}
        rowKey={(row) => row.id}
        page={page}
        pageSize={pageSize}
        total={query.data?.total ?? 0}
        loading={query.phase === 'loading' || query.phase === 'idle'}
        error={query.error ? t.listFailed : null}
        onRetry={query.reload}
        onPageChange={setPage}
        onPageSizeChange={(value) => {
          setPageSize(value);
          setPage(1);
        }}
      />
      {creating ? (
        <CreateKeyDialog
          onClose={() => {
            setCreating(false);
            query.reload();
          }}
        />
      ) : null}
      {revoking ? (
        <RevokeCredentialDialog
          {...revoking}
          onClose={() => setRevoking(null)}
          onRevoked={() => {
            setRevoking(null);
            setNotice(true);
            query.reload();
          }}
        />
      ) : null}
    </div>
  );
}
