'use client';

import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { useShell } from '../../components/shell/shell-provider';
import { assetMessages } from '../assets/messages';
import type { PollingState } from './polling-types';

export function PollingFeedback({
  paused,
  retryAt,
  onResume,
}: {
  paused: PollingState<unknown>['paused'];
  retryAt: number | null;
  onResume: () => void;
}) {
  const locale = useShell((state) => state.locale);
  const t = assetMessages[locale];
  if (!paused || paused === 'failure') return null;
  const text = paused === 'deadline' ? t.deadline : paused === 'hidden' ? t.hidden : t.limited;
  const retryTime =
    retryAt === null
      ? null
      : new Intl.DateTimeFormat(locale, { timeStyle: 'medium' }).format(new Date(retryAt));
  return (
    <Banner tone="warning" className="space-y-2">
      <p>{text}</p>
      {retryTime !== null ? (
        <p>
          {t.retryTime}: {retryTime}
        </p>
      ) : null}
      {paused !== 'hidden' ? (
        <Button variant="outline" onClick={onResume}>
          {t.verify}
        </Button>
      ) : null}
    </Banner>
  );
}
