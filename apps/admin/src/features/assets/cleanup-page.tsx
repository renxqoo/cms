'use client';

import { useSearchParams } from 'next/navigation';
import { Trash2Icon } from 'lucide-react';
import type { DataTableColumn } from '@new-cms/ui/data';
import type { CleanupEntry } from '../../contracts/assets';
import type { AssetMessages } from './messages';
import { Button } from '@new-cms/ui/actions';
import { NativeSelect } from '@new-cms/ui/forms';
import { Banner } from '@new-cms/ui/feedback';
import { PageHeader } from '@new-cms/ui/layout';
import { Drawer } from '@new-cms/ui/overlays';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { useShell } from '../../components/shell/shell-provider';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useQueryNavigation } from '../../components/shell/navigation/use-query-navigation';
import { cleanupPageSchema } from '../../contracts/assets';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { ManagementList } from '../management-shared/management-list';
import { assetDate } from '../jobs/work-copy';
import { parseCleanupQuery, cleanupQueryHref, cleanupState } from './cleanup-query';
import type { CleanupQuery } from './cleanup-query';
import { CleanupDetails } from './cleanup-details';
import { cleanupStatus } from './cleanup-query';
import { assetMessages } from './messages';

export function CleanupPage() {
  const locale = useShell((state) => state.locale);
  const t = assetMessages[locale];
  const params = useSearchParams();
  const [search, update] = useQueryNavigation(params.toString());
  const navigation = useAppNavigation();
  const access = useAccessControl();
  const query = parseCleanupQuery(new URLSearchParams(search));
  const result = useApiQuery({
    operation: 'assets.listCleanup',
    query: {
      page: query.page,
      pageSize: query.pageSize,
      blocked: query.blocked === 'true',
      ...(query.state ? { state: query.state } : {}),
    },
    response: cleanupPageSchema,
    enabled: access.can('assets.listCleanup'),
  });
  function change(changes: Partial<CleanupQuery>) {
    navigation.push(update(changes, cleanupQueryHref), { scroll: false });
  }
  return (
    <ClientInteractionBoundary className="space-y-6">
      <PageHeader
        title={t.cleanup}
        description={t.cleanupNotice}
        icon={<Trash2Icon />}
        actions={
          <Button variant="outline" onClick={result.reload}>
            {t.refresh}
          </Button>
        }
      />
      <ManagementFeedback error={result.error} onRetry={result.reload} />
      {access.can('assets.listCleanup') ? (
        <ManagementList
          columns={cleanupColumns({
            t,
            locale,
            open: (selected) => change({ selected, page: query.page }),
          })}
          rows={result.data?.rows ?? []}
          rowKey={(row) => row.id}
          page={query.page}
          pageSize={query.pageSize}
          total={result.data?.total ?? 0}
          loading={result.phase === 'loading' || result.phase === 'idle'}
          error={result.error ? t.failed : null}
          onRetry={result.reload}
          onPageChange={(page) => change({ page })}
          onPageSizeChange={(pageSize) => change({ pageSize })}
          filters={
            <>
              <NativeSelect
                aria-label={t.blockedOnly}
                value={query.blocked}
                onChange={(event) =>
                  change({ blocked: event.currentTarget.value === 'false' ? 'false' : 'true' })
                }
              >
                <option value="true">{t.blockedOnly}</option>
                <option value="false">{t.all}</option>
              </NativeSelect>
              <NativeSelect
                aria-label={t.cleanupState}
                value={query.state}
                onChange={(event) => change({ state: cleanupState(event.currentTarget.value) })}
              >
                <option value="">{t.all}</option>
                {(['pending', 'ready', 'deleting', 'deleted'] as const).map((state) => (
                  <option key={state} value={state}>
                    {cleanupStatus(state, t)}
                  </option>
                ))}
              </NativeSelect>
            </>
          }
        />
      ) : (
        <Banner tone="warning">{access.phase === 'loading' ? t.loading : t.denied}</Banner>
      )}
      <Drawer
        open={Boolean(query.selected)}
        onOpenChange={(open) => {
          if (!open) change({ selected: '', page: query.page });
        }}
        title={t.details}
        closeLabel={t.close}
      >
        {query.selected ? (
          <CleanupDetails key={query.selected} id={query.selected} onChanged={result.reload} />
        ) : null}
      </Drawer>
    </ClientInteractionBoundary>
  );
}

function cleanupColumns({
  t,
  locale,
  open,
}: {
  t: AssetMessages;
  locale: 'en' | 'zh';
  open: (id: string) => void;
}): DataTableColumn<CleanupEntry>[] {
  return [
    {
      key: 'id',
      header: t.item,
      cell: (row) => (
        <Button
          variant="link"
          className="max-w-64 whitespace-normal break-all text-left"
          onClick={() => open(row.id)}
        >
          {row.id}
        </Button>
      ),
    },
    { key: 'state', header: t.status, cell: (row) => cleanupStatus(row.state, t) },
    { key: 'blocked', header: t.cleanupBlocked, cell: (row) => (row.blocked ? t.yes : t.no) },
    { key: 'attempts', header: t.attempts, cell: (row) => row.attempts },
    {
      key: 'retainUntil',
      header: t.retainUntil,
      cell: (row) => assetDate(row.retainUntil, locale),
    },
  ];
}
