'use client';

import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { PlusIcon, Table2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@new-cms/ui/actions';
import { DataTable, Pagination } from '@new-cms/ui/data';
import { Banner } from '@new-cms/ui/feedback';
import { NativeSelect } from '@new-cms/ui/forms';
import { ListContent, ListFooter, ListPanel, ListToolbar, PageHeader } from '@new-cms/ui/layout';
import { useShell } from '../../components/shell/shell-provider';
import { createExampleDocuments, queryExampleDocuments } from './list-data';
import type { ExampleDocument } from './list-data';
import { parseListQuery } from './list-query';
import type { updateListQuery } from './list-query';
import { ExampleDialog } from './example-dialog';
import { ListSearch } from './list-search';
import { createListColumns } from './list-columns';
import { useListQueryNavigation } from './use-list-query-navigation';

export function ListWorkbench() {
  const t = useTranslations('lists');
  const locale = useShell((state) => state.locale);
  const router = useAppNavigation();
  const params = useSearchParams();
  const [search, updateQuery] = useListQueryNavigation(params.toString());
  const query = parseListQuery(new URLSearchParams(search));
  const [rows, setRows] = useState(createExampleDocuments);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [modified, setModified] = useState(false);
  const [pending, startTransition] = useTransition();
  const matching = queryExampleDocuments(rows, query, locale);
  const pages = Math.max(1, Math.ceil(matching.length / query.pageSize));
  const page = Math.min(query.page, pages);
  const pageRows = matching.slice((page - 1) * query.pageSize, page * query.pageSize);
  const selected = selectedIds.filter((id) => pageRows.some((row) => row.id === id));
  const editing = rows.find((row) => row.id === editingId);

  function changeQuery(changes: Parameters<typeof updateListQuery>[1]) {
    setSelectedIds([]);
    const href = updateQuery(changes);
    startTransition(() => router.push(href, { scroll: false }));
  }

  function edit(row?: ExampleDocument) {
    setEditingId(row?.id);
    setOpen(true);
  }

  function apply(document: ExampleDocument) {
    setRows((current) =>
      editing
        ? current.map((row) => (row.id === document.id ? document : row))
        : [document, ...current],
    );
    setModified(true);
  }

  const columns = createListColumns({
    locale,
    onEdit: edit,
    labels: {
      title: t('titleColumn'),
      category: t('category'),
      status: t('status'),
      updatedAt: t('updatedAt'),
      actions: t('actions'),
      edit: t('edit'),
      draft: t('draft'),
      published: t('published'),
    },
  });

  function sort(next: { key: string; direction: 'asc' | 'desc' } | null) {
    if (!next) changeQuery({ sort: null });
    else if (next.key === 'title' || next.key === 'updatedAt')
      changeQuery({ sort: { key: next.key, direction: next.direction } });
  }

  return (
    <ClientInteractionBoundary className="flex flex-col gap-4 md:gap-6">
      <PageHeader
        title={t('title')}
        description={
          <>
            {t('description')} · {t('total', { count: matching.length })}
          </>
        }
        icon={<Table2Icon />}
        actions={
          <Button onClick={() => edit()}>
            <PlusIcon />
            {t('create')}
          </Button>
        }
      />
      {modified && <Banner tone="success">{t('modified')}</Banner>}
      <ListPanel>
        <ListToolbar>
          <div className="w-full min-w-0 sm:max-w-lg">
            <ListSearch key={query.q} query={query.q} onSearch={(q) => changeQuery({ q })} />
          </div>
          <NativeSelect
            value={query.status}
            aria-label={t('statusFilter')}
            className="w-full sm:w-36"
            onChange={(event) => {
              const { value } = event.currentTarget;
              changeQuery({ status: value === 'draft' || value === 'published' ? value : 'all' });
            }}
          >
            <option value="all">{t('all')}</option>
            <option value="draft">{t('draft')}</option>
            <option value="published">{t('published')}</option>
          </NativeSelect>
        </ListToolbar>
        {selected.length > 0 && (
          <div className="flex items-center justify-between gap-2 border-b px-4 py-2 text-sm">
            <span>{t('selected', { count: selected.length })}</span>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
              {t('clearSelection')}
            </Button>
          </div>
        )}
        <ListContent>
          <DataTable
            columns={columns}
            rows={pageRows}
            rowKey={(row) => row.id}
            sort={query.sort}
            onSortChange={sort}
            selectedIds={selected}
            onSelectionChange={setSelectedIds}
            selectionLabel={t('selection')}
            rowSelectionLabel={(row) => t('selectRow', { title: row.title[locale] })}
            loading={pending}
            loadingLabel={t('loading')}
            emptyLabel={t('empty')}
          />
        </ListContent>
        <ListFooter>
          <Pagination
            page={page}
            pageSize={query.pageSize}
            total={matching.length}
            onPageChange={(value) => changeQuery({ page: value })}
            onPageSizeChange={(change) =>
              changeQuery({ pageSize: change.pageSize, page: change.page })
            }
            pageSizeOptions={[5, 10, 20]}
            previousLabel={t('previous')}
            nextLabel={t('next')}
            pageLabel={t('page', { page, pages })}
            totalLabel={t('total', { count: matching.length })}
            pageSizeLabel={t('pageSize')}
          />
        </ListFooter>
      </ListPanel>
      <ExampleDialog open={open} onOpenChange={setOpen} editing={editing} onApply={apply} />
    </ClientInteractionBoundary>
  );
}
