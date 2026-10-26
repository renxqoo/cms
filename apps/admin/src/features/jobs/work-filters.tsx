'use client';

import { NativeSelect } from '@new-cms/ui/forms';
import { useShell } from '../../components/shell/shell-provider';
import type { Collection } from '../../contracts/content';
import { assetMessages } from '../assets/messages';
import { workFilter } from './query';
import type { WorkQuery } from './query';
import { workAction, workStatus } from './work-copy';

export function WorkFilters({
  query,
  collections,
  onChange,
}: {
  query: WorkQuery;
  collections: readonly Collection[];
  onChange: (changes: Partial<WorkQuery>) => void;
}) {
  const t = assetMessages[useShell((state) => state.locale)];
  const statuses =
    query.view === 'jobs'
      ? ['queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled']
      : [
          'pending',
          'uploading',
          'processing',
          'ready',
          'consumed',
          'failed',
          'cancelled',
          'expired',
        ];
  return (
    <>
      <NativeSelect
        aria-label={t.collection}
        value={query.collection}
        onChange={(event) => onChange({ collection: event.currentTarget.value, selected: '' })}
      >
        <option value="">{t.selectCollection}</option>
        {collections.map((row) => (
          <option key={row.key} value={row.key}>
            {row.label}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label={t.status}
        value={query.status}
        onChange={(event) =>
          onChange({ status: workFilter('status', event.currentTarget.value), selected: '' })
        }
      >
        <option value="">{t.all}</option>
        {statuses.map((status) => (
          <option key={status} value={status}>
            {workStatus(status, t)}
          </option>
        ))}
      </NativeSelect>
      {query.view === 'jobs' ? (
        <NativeSelect
          aria-label={t.action}
          value={query.action}
          onChange={(event) =>
            onChange({ action: workFilter('action', event.currentTarget.value), selected: '' })
          }
        >
          <option value="">{t.all}</option>
          {(['batch', 'publication', 'extension', 'process', 'reprocess'] as const).map(
            (action) => (
              <option key={action} value={action}>
                {workAction(action, t)}
              </option>
            ),
          )}
        </NativeSelect>
      ) : (
        <NativeSelect
          aria-label={t.purpose}
          value={query.purpose}
          onChange={(event) =>
            onChange({
              purpose:
                event.currentTarget.value === 'replace'
                  ? 'replace'
                  : event.currentTarget.value === 'create'
                    ? 'create'
                    : '',
              selected: '',
            })
          }
        >
          <option value="">{t.all}</option>
          <option value="create">{t.createDocument}</option>
          <option value="replace">{t.replace}</option>
        </NativeSelect>
      )}
    </>
  );
}
