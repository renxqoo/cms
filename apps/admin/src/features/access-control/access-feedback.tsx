'use client';

import { Banner } from '@new-cms/ui/feedback';
import { useShell } from '../../components/shell/shell-provider';
import { ManagementFeedback } from '../management-shared/feedback';
import { managementMessages } from '../management-shared/messages';
import { useAccessControl } from './provider';

export function AccessFeedback({ empty, invalid }: { empty: boolean; invalid: boolean }) {
  const access = useAccessControl();
  const locale = useShell((state) => state.locale);
  const t = managementMessages[locale];
  if (access.phase === 'loading')
    return (
      <Banner>
        <p>{t.accessLoading}</p>
      </Banner>
    );
  if (access.phase === 'failed')
    return (
      <div className="space-y-3">
        <Banner tone="error">{t.accessFailed}</Banner>
        <ManagementFeedback error={access.error} onRetry={access.refresh} />
      </div>
    );
  if (invalid) return <Banner tone="warning">{t.invalidMenu}</Banner>;
  if (empty) return <Banner>{t.emptyMenu}</Banner>;
  return null;
}
