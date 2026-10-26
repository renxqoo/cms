'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Trash2Icon } from 'lucide-react';
import { Banner } from '@new-cms/ui/feedback';
import { Field, NativeSelect } from '@new-cms/ui/forms';
import { PageHeader } from '@new-cms/ui/layout';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { useShell } from '../../components/shell/shell-provider';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useQueryNavigation } from '../../components/shell/navigation/use-query-navigation';
import { cleanupPageSchema, cleanupStateSchema } from '../../contracts/cleanups';
import type { CleanupEntry } from '../../contracts/cleanups';
import { useAccessControl } from '../access-control/provider';
import { ManagementFeedback } from '../management-shared/feedback';
import { ManagementList } from '../management-shared/management-list';
import { usePollingQuery } from '../jobs/use-polling-query';
import { discoveryPolicy } from '../jobs/policy';
import { PollingFeedback } from '../jobs/polling-feedback';
import { createCleanupColumns } from './columns';
import { cleanupQueryHref, parseCleanupQuery } from '../jobs/query';
import type { CleanupQuery } from '../jobs/query';
import { cleanupMessages } from './messages';
import { CleanupDetail } from './cleanup-detail';

const active = (data: { rows: readonly CleanupEntry[] }) =>
  data.rows.some((entry) => !entry.blocked && entry.state !== 'deleted');

export function CleanupsPage() {
  const access = useAccessControl();
  const locale = useShell((state) => state.locale);
  const t = cleanupMessages[locale];
  const router = useAppNavigation();
  const params = useSearchParams();
  const [search, update] = useQueryNavigation(params.toString());
  const query = parseCleanupQuery(new URLSearchParams(search));
  function change(changes: Partial<CleanupQuery>) {
    router.push(update(changes, cleanupQueryHref), { scroll: false });
  }
  return (
    <ClientInteractionBoundary className="space-y-6">
      <PageHeader title={t.title} description={t.description} icon={<Trash2Icon />} />
      <ManagementFeedback error={access.error} onRetry={access.refresh} />
      {access.phase === 'ready' && access.can('assets.listCleanup') ? (
        <CleanupList
          key={JSON.stringify([access.principal.id, search])}
          query={query}
          change={change}
        />
      ) : (
        <Banner tone="warning">{t.denied}</Banner>
      )}
    </ClientInteractionBoundary>
  );
}

function CleanupList({
  query,
  change,
}: {
  query: CleanupQuery;
  change: (changes: Partial<CleanupQuery>) => void;
}) {
  const locale = useShell((state) => state.locale);
  const t = cleanupMessages[locale];
  const access = useAccessControl();
  const result = usePollingQuery({
    operation: 'assets.listCleanup',
    query: {
      page: query.page,
      pageSize: query.pageSize,
      blocked: query.blocked,
      ...(query.state ? { state: query.state } : {}),
    },
    response: cleanupPageSchema,
    enabled: access.can('assets.listCleanup'),
    intervalMs: discoveryPolicy.listIntervalMs,
    active,
  });
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <>
      <ManagementFeedback error={result.error} onRetry={result.resume} />
      <PollingFeedback
        expired={result.expired}
        observing={result.observing}
        resume={result.resume}
      />
      <ManagementList
        columns={createCleanupColumns({
          t,
          locale,
          canRead: access.can('assets.getCleanup'),
          open: setSelected,
        })}
        rows={result.data?.rows ?? []}
        rowKey={(row) => row.id}
        page={query.page}
        pageSize={query.pageSize}
        total={result.data?.total ?? 0}
        loading={result.phase === 'loading' || (result.phase === 'idle' && result.data === null)}
        error={result.error ? t.loadFailed : null}
        onRetry={result.resume}
        onPageChange={(page) => change({ page })}
        onPageSizeChange={(pageSize) => change({ pageSize })}
        filters={
          <>
            <Field id="cleanup-blocked" label={t.blocked}>
              <NativeSelect
                value={String(query.blocked)}
                onChange={(event) => change({ blocked: event.target.value === 'true' })}
              >
                <option value="true">{t.blockedOnly}</option>
                <option value="false">{t.allEntries}</option>
              </NativeSelect>
            </Field>
            <Field id="cleanup-state" label={t.state}>
              <NativeSelect
                value={query.state ?? ''}
                onChange={(event) =>
                  change({
                    state: cleanupStateSchema.safeParse(event.target.value).success
                      ? cleanupStateSchema.parse(event.target.value)
                      : undefined,
                  })
                }
              >
                <option value="">{t.all}</option>
                {cleanupStateSchema.options.map((state) => (
                  <option key={state} value={state}>
                    {t[state]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </>
        }
      />
      {selected ? (
        <CleanupDetail id={selected} onClose={() => setSelected(null)} onChanged={result.resume} />
      ) : null}
    </>
  );
}
