'use client';
import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Dialog, DialogContent, DialogTitle } from '@new-cms/ui/overlays';
import { useShell } from '../../components/shell/shell-provider';
import { queryPresetPageSchema } from '../../contracts/query-presets';
import type { Collection } from '../../contracts/content';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { queryFilter } from './query';
import type { DocumentQuery } from './query';
import { CreatePresetForm } from './query-preset-create';
import { PresetActions } from './query-preset-actions';
import { queryMessages } from './query-messages';
export function QueryPresetManager({
  collection,
  query,
  columns,
  onApply,
}: {
  collection: Collection;
  query: DocumentQuery;
  columns: string[];
  onApply: (query: Partial<DocumentQuery>) => void;
}) {
  const locale = useShell((state) => state.locale);
  const t = queryMessages[locale];
  const access = useAccessControl();
  const scope = { scopeKind: 'collection', collectionKey: collection.key } as const;
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const presets = useApiQuery({
    operation: 'queryPresets.list',
    params: { collection: collection.key },
    query: { page, pageSize: 20, locale: query.locale },
    response: queryPresetPageSchema,
    enabled:
      open && collection.enableQueryPresets !== false && access.can('queryPresets.list', scope),
  });
  const filter = queryFilter(query, collection);
  const values = {
    ...(filter.where ? { where: filter.where } : {}),
    sort: query.sort,
    columns,
    q: query.q,
    ...(query.groupBy ? { groupBy: query.groupBy } : {}),
  };
  if (collection.enableQueryPresets === false || !access.can('queryPresets.list', scope))
    return null;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {t.presets}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t.close} className="max-h-[90vh] overflow-auto sm:max-w-3xl">
          <DialogTitle>{t.presets}</DialogTitle>
          <ManagementFeedback error={presets.error} onRetry={presets.reload} />
          {open ? (
            <>
              <CreatePresetForm
                collection={collection}
                query={values}
                valid={filter.valid}
                reload={presets.reload}
                contentLocale={query.locale}
              />
              {presets.data?.rows.map((row) => (
                <article key={row.id} className="space-y-3 rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      {row.name} · {row.shared ? t.shared : t.private}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        onApply({
                          where: row.query.where ? JSON.stringify(row.query.where) : '',
                          sort: row.query.sort,
                          columns: row.query.columns,
                          q: row.query.q,
                          groupBy: row.query.groupBy ?? null,
                          queryByGroup: undefined,
                        });
                        setOpen(false);
                      }}
                    >
                      {t.use}
                    </Button>
                  </div>
                  <PresetActions
                    key={row.version}
                    row={row}
                    collection={collection}
                    query={values}
                    valid={filter.valid}
                    reload={presets.reload}
                    contentLocale={query.locale}
                  />
                </article>
              ))}
            </>
          ) : null}
          {presets.data?.total === 0 ? <p>{t.empty}</p> : null}
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              {t.previous}
            </Button>
            <span>
              {t.page} {page}
            </span>
            <Button
              variant="outline"
              disabled={!presets.data || page * 20 >= presets.data.total}
              onClick={() => setPage(page + 1)}
            >
              {t.next}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
