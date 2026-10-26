'use client';

import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { cleanupEntrySchema } from '../../contracts/assets';
import { useShell } from '../../components/shell/shell-provider';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { assetDate } from '../jobs/work-copy';
import { CleanupRetryDialog } from './cleanup-retry-dialog';
import { cleanupStatus } from './cleanup-query';
import { assetMessages } from './messages';

export function CleanupDetails({ id, onChanged }: { id: string; onChanged: () => void }) {
  const locale = useShell((state) => state.locale);
  const t = assetMessages[locale];
  const access = useAccessControl();
  const query = useApiQuery({
    operation: 'assets.getCleanup',
    params: { id },
    response: cleanupEntrySchema,
    enabled: access.can('assets.getCleanup'),
  });
  const [retrying, setRetrying] = useState(false);
  const entry = query.data;
  if (!access.can('assets.getCleanup')) return <Banner tone="warning">{t.denied}</Banner>;
  return (
    <div className="space-y-4">
      <ManagementFeedback error={query.error} onRetry={query.reload} />
      <Banner>{t.cleanupNotice}</Banner>
      {entry ? (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {[
              [t.item, entry.id],
              [t.status, cleanupStatus(entry.state, t)],
              [t.cleanupBlocked, entry.blocked ? t.yes : t.no],
              [t.attempts, entry.attempts],
              [t.failureCode, entry.failureCode ?? '—'],
              [t.retainUntil, assetDate(entry.retainUntil, locale)],
              [t.writeDeadline, assetDate(entry.writeDeadline, locale)],
              [t.nextCleanup, assetDate(entry.nextCleanupAt, locale)],
            ].map(([label, value]) => (
              <div className="contents" key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="min-w-0 break-all">{value}</dd>
              </div>
            ))}
          </dl>
          {entry.blocked && access.can('assets.retryCleanup') ? (
            <Button variant="outline" onClick={() => setRetrying(true)}>
              {t.retryCleanup}
            </Button>
          ) : null}
          {retrying ? (
            <CleanupRetryDialog
              entry={entry}
              onClose={() => setRetrying(false)}
              onAccepted={() => {
                query.reload();
                onChanged();
              }}
            />
          ) : null}
        </>
      ) : (
        <p role="status">{t.loading}</p>
      )}
    </div>
  );
}
