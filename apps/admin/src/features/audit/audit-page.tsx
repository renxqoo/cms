'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileClockIcon } from 'lucide-react';
import { Banner } from '@new-cms/ui/feedback';
import { PageHeader } from '@new-cms/ui/layout';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { useShell } from '../../components/shell/shell-provider';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useQueryNavigation } from '../../components/shell/navigation/use-query-navigation';
import { auditListSchema } from '../../contracts/access';
import type { Audit } from '../../contracts/access';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { ManagementList, managementListState } from '../management-shared/management-list';
import { AuditDetail } from './audit-detail';
import { AuditFilterForm } from './audit-filters';
import { createAuditColumns } from './audit-columns';
import { auditQueryHref, parseAuditQuery } from './audit-query';
import type { AuditQuery } from './audit-query';
import { auditMessages } from './audit-messages';

export function AuditPage() {
  const locale = useShell((state) => state.locale);
  const t = auditMessages[locale];
  const access = useAccessControl();
  const router = useAppNavigation();
  const params = useSearchParams();
  const [search, update] = useQueryNavigation(params.toString());
  const query = parseAuditQuery(new URLSearchParams(search));
  const result = useApiQuery({
    operation: 'audit.list',
    query: { ...query },
    response: auditListSchema,
    enabled: access.can('audit.list'),
  });
  const [record, setRecord] = useState<Audit | null>(null);
  function change(changes: Partial<AuditQuery>) {
    router.push(update(changes, auditQueryHref), { scroll: false });
  }
  function clear() {
    router.push(
      update(
        { pageSize: query.pageSize },
        (_search, next) => `/dashboard/audit-logs?page=1&pageSize=${next.pageSize}`,
      ),
    );
  }
  const tableState = managementListState(access.phase, result.phase);
  const columns = createAuditColumns({ locale, open: setRecord });
  return (
    <ClientInteractionBoundary className="space-y-6">
      <PageHeader title={t.title} description={t.description} icon={<FileClockIcon />} />
      <AuditFilterForm
        key={JSON.stringify(query)}
        query={query}
        locale={locale}
        onApply={(next) =>
          router.push(
            update(next, (_search, value) => auditQueryHref(new URLSearchParams(), value)),
          )
        }
        onClear={clear}
      />
      <ManagementFeedback
        error={result.error}
        onRetry={() => {
          if (access.phase === 'failed') access.refresh();
          else result.reload();
        }}
      />
      {access.phase === 'ready' && !access.can('audit.list') ? (
        <Banner tone="warning">{t.readDenied}</Banner>
      ) : (
        <ManagementList
          columns={columns}
          rows={result.data?.rows ?? []}
          rowKey={(entry) => entry.id}
          page={query.page}
          pageSize={query.pageSize}
          total={result.data?.total ?? 0}
          loading={tableState.loading}
          error={tableState.failed ? t.loadFailed : null}
          query={query.q}
          onSearch={(q) => change({ q })}
          onPageChange={(page) => change({ page })}
          onPageSizeChange={(pageSize) => change({ pageSize })}
          onRetry={() => {
            if (access.phase === 'failed') access.refresh();
            else result.reload();
          }}
          sort={{ key: 'createdAt', direction: query.order }}
          onSortChange={(sort) => change({ order: sort?.direction ?? 'desc' })}
        />
      )}
      {record ? <AuditDetail record={record} onClose={() => setRecord(null)} /> : null}
    </ClientInteractionBoundary>
  );
}
