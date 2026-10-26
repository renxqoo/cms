'use client';

import { useEffect, useRef, useState } from 'react';
import { Banner } from '@new-cms/ui/feedback';
import { Button } from '@new-cms/ui/actions';
import { requestApi } from '../../api/client';
import { cleanupRetryReceiptSchema } from '../../contracts/assets';
import type { CleanupEntry } from '../../contracts/assets';
import { useShell } from '../../components/shell/shell-provider';
import { useAccessControl } from '../access-control/provider';
import { ManagementDialog } from '../management-shared/management-dialog';
import { ManagementFeedback } from '../management-shared/feedback';
import type { ApiFailure } from '../management-shared/query';
import { assetMessages } from './messages';

export function CleanupRetryDialog({
  entry,
  onClose,
  onAccepted,
}: {
  entry: CleanupEntry;
  onClose: () => void;
  onAccepted: () => void;
}) {
  const t = assetMessages[useShell((state) => state.locale)];
  const access = useAccessControl();
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const active = useRef<AbortController | null>(null);
  const key = useRef<string | null>(null);
  const retryAt = useRef(0);
  useEffect(() => () => active.current?.abort(), []);
  async function submit() {
    if (
      active.current ||
      accepted ||
      !entry.blocked ||
      !access.can('assets.retryCleanup') ||
      retryAt.current > Date.now()
    )
      return;
    key.current ??= crypto.randomUUID();
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    const result = await requestApi({
      operation: 'assets.retryCleanup',
      params: { id: entry.id },
      body: {},
      idempotencyKey: key.current,
      response: cleanupRetryReceiptSchema,
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    active.current = null;
    setPending(false);
    access.reportResult(result);
    if (result.ok) {
      setAccepted(true);
      setError(null);
      onAccepted();
    } else {
      setError(result);
      retryAt.current = Date.now() + (result.retryAfterSeconds ?? 0) * 1000;
    }
  }
  return (
    <ManagementDialog
      open
      onClose={onClose}
      title={t.retryCleanup}
      description={t.cleanupNotice}
      submitLabel={t.confirm}
      pending={pending}
      locked={error?.uncertain === true}
      disabled={pending || accepted || !entry.blocked || !access.can('assets.retryCleanup')}
      onSubmit={() => void submit()}
      actions={
        error?.uncertain ? (
          <Button variant="outline" disabled={pending} onClick={() => void submit()}>
            {t.verify}
          </Button>
        ) : null
      }
      feedback={
        <>
          <ManagementFeedback error={error} />
          {accepted ? <Banner tone="success">{t.accepted}</Banner> : null}
        </>
      }
    >
      <p className="break-all text-sm">{entry.id}</p>
    </ManagementDialog>
  );
}
