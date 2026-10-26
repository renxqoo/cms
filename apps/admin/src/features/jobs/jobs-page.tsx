'use client';

import { useSearchParams } from 'next/navigation';
import { ActivityIcon } from 'lucide-react';
import { PageHeader } from '@new-cms/ui/layout';
import { NativeSelect } from '@new-cms/ui/forms';
import { Banner } from '@new-cms/ui/feedback';
import { Drawer } from '@new-cms/ui/overlays';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { useShell } from '../../components/shell/shell-provider';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useQueryNavigation } from '../../components/shell/navigation/use-query-navigation';
import { collectionListSchema } from '../../contracts/content';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { assetMessages } from '../assets/messages';
import { parseWorkQuery, workQueryHref } from './query';
import type { WorkQuery } from './query';
import { WorkFilters } from './work-filters';
import { JobsList, UploadsList } from './work-list';
import { JobDetails, UploadDetails } from './work-details';

export function JobsPage() {
  const t = assetMessages[useShell((state) => state.locale)];
  const params = useSearchParams();
  const [search, update] = useQueryNavigation(params.toString());
  const navigation = useAppNavigation();
  const access = useAccessControl();
  const query = parseWorkQuery(new URLSearchParams(search));
  const catalog = useApiQuery({
    operation: 'collections.list',
    response: collectionListSchema,
    enabled: access.can('collections.list'),
  });
  const collections = (catalog.data?.rows ?? []).filter(
    (row) => query.view === 'jobs' || row.upload,
  );
  const selected = collections.find((row) => row.key === query.collection);
  function change(changes: Partial<WorkQuery>) {
    navigation.push(update(changes, workQueryHref), { scroll: false });
  }
  return (
    <ClientInteractionBoundary className="space-y-6">
      <PageHeader title={t.jobs} icon={<ActivityIcon />} />
      <ManagementFeedback error={catalog.error} onRetry={catalog.reload} />
      <div className="flex flex-wrap gap-2">
        <NativeSelect
          aria-label={t.jobs}
          value={query.view}
          onChange={(event) =>
            change({
              view: event.currentTarget.value === 'uploads' ? 'uploads' : 'jobs',
              selected: '',
              status: '',
              action: '',
              purpose: '',
            })
          }
        >
          <option value="jobs">{t.jobs}</option>
          <option value="uploads">{t.session}</option>
        </NativeSelect>
        <WorkFilters query={query} collections={collections} onChange={change} />
      </div>
      {selected ? (
        query.view === 'jobs' ? (
          <JobsList
            key={JSON.stringify([query.collection, workListKey(query)])}
            query={query}
            onChange={change}
          />
        ) : (
          <UploadsList
            key={JSON.stringify([query.collection, workListKey(query)])}
            query={query}
            onChange={change}
          />
        )
      ) : (
        <Banner>{catalog.phase === 'loading' ? t.loading : t.selectCollection}</Banner>
      )}
      <Drawer
        open={Boolean(selected && query.selected)}
        onOpenChange={(open) => {
          if (!open) change({ selected: '', page: query.page });
        }}
        title={t.details}
        closeLabel={t.close}
      >
        {selected && query.selected ? (
          query.view === 'jobs' ? (
            <JobDetails
              key={`${query.collection}/${query.selected}`}
              collection={query.collection}
              id={query.selected}
            />
          ) : (
            <UploadDetails
              key={`${query.collection}/${query.selected}`}
              collection={query.collection}
              id={query.selected}
            />
          )
        ) : null}
      </Drawer>
    </ClientInteractionBoundary>
  );
}

function workListKey({ selected: _selected, ...query }: WorkQuery) {
  return query;
}
