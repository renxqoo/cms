'use client';

import { useState } from 'react';
import { EyeIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { ManagementDialog } from '../../management-shared/management-dialog';
import { ManagementFeedback } from '../../management-shared/feedback';
import type { ApiResult } from '../../../api/result';
import type { contentMessages } from '../messages';
import { useContentPreview } from './use-content-preview';
import type { PreviewTarget } from './contracts';
interface PreviewProps {
  target: PreviewTarget;
  disabled: boolean;
  canRevoke: boolean;
  t: (typeof contentMessages)['en' | 'zh'];
  report: (result: ApiResult<unknown>) => void;
}
function PreviewDialog({
  target,
  disabled,
  canRevoke,
  t,
  report,
  onClose,
}: PreviewProps & { onClose: () => void }) {
  const flow = useContentPreview(target, report);
  return (
    <ManagementDialog
      open
      onClose={onClose}
      title={t.draftPreview}
      description={t.previewHint}
      submitLabel={t.generatePreview}
      disabled={disabled || flow.pending}
      pending={flow.pending}
      onSubmit={() => {
        void flow.issue();
      }}
    >
      <ManagementFeedback error={flow.failure} />
      <p className="text-sm text-muted-foreground">
        {t.previewRevision}: {target.revision}
      </p>
      {flow.ticket ? (
        <div className="space-y-3">
          <p className="text-sm">
            {t.previewExpires}:{' '}
            <time dateTime={flow.ticket.expiresAt}>{flow.ticket.expiresAt}</time>
          </p>
          {flow.expired ? (
            <p role="status">{t.previewExpired}</p>
          ) : (
            <a
              href={flow.ticket.url}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              className="inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t.openPreview}
            </a>
          )}
          {canRevoke && !flow.expired ? (
            <Button
              variant="outline"
              disabled={flow.pending}
              onClick={() => {
                void flow.revoke();
              }}
            >
              {t.revokePreview}
            </Button>
          ) : null}
        </div>
      ) : null}
    </ManagementDialog>
  );
}
export function ContentPreviewControl(props: PreviewProps & { permitted: boolean }) {
  const [open, setOpen] = useState(false);
  if (props.target.collection !== 'models' || !props.permitted) return null;
  return (
    <>
      <Button variant="outline" disabled={props.disabled} onClick={() => setOpen(true)}>
        <EyeIcon aria-hidden="true" />
        {props.t.draftPreview}
      </Button>
      {open ? <PreviewDialog {...props} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
