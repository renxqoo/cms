'use client';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { useShell } from '../../components/shell/shell-provider';
import { workMessages } from './messages';

export function PollingFeedback({
  expired,
  observing,
  resume,
}: {
  expired: boolean;
  observing: boolean;
  resume: () => void;
}) {
  const locale = useShell((state) => state.locale);
  const t = workMessages[locale];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {expired ? (
        <Banner tone="warning">{t.expired}</Banner>
      ) : (
        <p className="text-xs text-muted-foreground">{observing ? t.polling : t.paused}</p>
      )}
      <Button variant="outline" onClick={resume}>
        {expired ? t.continue : t.refresh}
      </Button>
    </div>
  );
}
