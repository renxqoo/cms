'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ImagesIcon, UploadIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { PageHeader } from '@new-cms/ui/layout';
import { Drawer } from '@new-cms/ui/overlays';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { UnsavedChangesGuard } from '../../components/cms/unsaved-changes';
import { useShell } from '../../components/shell/shell-provider';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useQueryNavigation } from '../../components/shell/navigation/use-query-navigation';
import { ManagementFeedback } from '../management-shared/feedback';
import { ManagementList } from '../management-shared/management-list';
import { resourceColumns } from './resource-columns';
import { ResourceFilters } from './resource-filters';
import { ResourceDetails } from './resource-details';
import { ResourceUploadDialog } from './resource-upload-dialog';
import { parseResourceQuery, resourceQueryHref } from './resource-query';
import type { ResourceQuery } from './resource-query';
import { useResourceData } from './resource-data';
import { assetMessages } from './messages';

export function ResourcesPage() {
  const locale = useShell((state) => state.locale);
  const t = assetMessages[locale];
  const params = useSearchParams();
  const [search, update] = useQueryNavigation(params.toString());
  const navigation = useAppNavigation();
  const query = parseResourceQuery(new URLSearchParams(search));
  const { access, catalog, collections, allowed, result, uploadCollections } =
    useResourceData(query);
  const [selected, setSelected] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadActive, setUploadActive] = useState(false);
  const [stopped, setStopped] = useState(false);
  const resource = selectedResource({ allowed, result, selected });
  function change(changes: Partial<ResourceQuery>) {
    setSelected(null);
    navigation.push(update(changes, resourceQueryHref), { scroll: false });
  }
  function closeUpload() {
    setUploading(false);
    setUploadActive(false);
  }
  return (
    <UnsavedChangesGuard
      dirty={uploadActive}
      navigation={navigation.adapter}
      labels={{
        title: t.leaveTitle,
        description: t.leaveDescription,
        confirm: t.leave,
        cancel: t.keepWaiting,
        close: t.close,
      }}
    >
      <ClientInteractionBoundary className="space-y-6">
        <PageHeader
          title={t.resources}
          description={t.description}
          icon={<ImagesIcon />}
          actions={
            uploadCollections.length > 0 ? (
              <Button
                onClick={() => {
                  setStopped(false);
                  setUploading(true);
                }}
              >
                <UploadIcon />
                {t.upload}
              </Button>
            ) : null
          }
        />
        <ManagementFeedback
          error={catalog.error ?? result.error}
          onRetry={() => {
            catalog.reload();
            result.reload();
          }}
        />
        <LocalUploadNotice visible={stopped} collection={query.collection} />
        {allowed ? (
          <ManagementList
            columns={resourceColumns({
              t,
              locale,
              collections,
              open: (row) => setSelected(`${row.collection}/${row.id}`),
            })}
            rows={result.data?.rows ?? []}
            rowKey={(row) => `${row.collection}/${row.id}`}
            page={query.page}
            pageSize={query.pageSize}
            total={result.data?.total ?? 0}
            loading={result.phase === 'loading' || result.phase === 'idle'}
            error={result.error ? t.failed : null}
            onRetry={result.reload}
            query={query.q}
            onSearch={(q) => change({ q })}
            onPageChange={(page) => change({ page })}
            onPageSizeChange={(pageSize) => change({ pageSize })}
            filters={<ResourceFilters query={query} collections={collections} onChange={change} />}
          />
        ) : (
          <Banner>{access.phase === 'loading' ? t.loading : t.denied}</Banner>
        )}
        <Drawer
          open={Boolean(resource)}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          title={t.details}
          closeLabel={t.close}
        >
          {resource ? (
            <ResourceDetails
              key={`${resource.collection}/${resource.id}/${resource.versionId}`}
              resource={resource}
              onChanged={result.reload}
            />
          ) : null}
        </Drawer>
        {uploading ? (
          <ResourceUploadDialog
            collections={uploadCollections}
            initialCollection={query.collection}
            onClose={closeUpload}
            onStop={() => {
              setStopped(true);
              closeUpload();
            }}
            onActivityChange={setUploadActive}
          />
        ) : null}
      </ClientInteractionBoundary>
    </UnsavedChangesGuard>
  );
}

function LocalUploadNotice({ visible, collection }: { visible: boolean; collection: string }) {
  const t = assetMessages[useShell((state) => state.locale)];
  const navigation = useAppNavigation();
  if (!visible) return null;
  return (
    <Banner tone="warning" className="space-y-2">
      <p>{t.localStopped}</p>
      <Button
        variant="outline"
        onClick={() =>
          navigation.push(
            `/dashboard/jobs?view=uploads${collection ? `&collection=${collection}` : ''}`,
          )
        }
      >
        {t.jobs}
      </Button>
    </Banner>
  );
}

function selectedResource({
  allowed,
  result,
  selected,
}: Pick<ReturnType<typeof useResourceData>, 'allowed' | 'result'> & { selected: string | null }) {
  if (!allowed || result.error) return null;
  return result.data?.rows.find((row) => `${row.collection}/${row.id}` === selected);
}
