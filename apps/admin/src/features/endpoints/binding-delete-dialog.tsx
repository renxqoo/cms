'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { requestApi } from '../../api/client';
import type { ApiResult } from '../../api/client';
import { emptyResponseSchema } from '../../contracts/auth';
import { useShell } from '../../components/shell/shell-provider';
import { useAccessControl } from '../access-control/provider';
import { ManagementDialog } from '../management-shared/management-dialog';
import { ManagementFeedback } from '../management-shared/feedback';
import { bindingReadSource } from './binding-read';
import type { BindingTarget, BindingReadSource } from './binding-read';
import { endpointMessages } from './endpoint-messages';

type Failure = Extract<ApiResult<unknown>, { ok: false }>;

export function BindingDeleteDialog({
  endpoint,
  catalogReady,
  onClose,
  onDeleted,
  onRetryDependencies,
  source = bindingReadSource,
}: {
  endpoint: BindingTarget;
  catalogReady: boolean;
  onRetryDependencies?: () => void;
  onClose: () => void;
  onDeleted: () => void;
  source?: BindingReadSource;
}) {
  const locale = useShell((state) => state.locale);
  const t = endpointMessages[locale];
  const access = useAccessControl();
  const [current, setCurrent] = useState(endpoint);
  const [latest, setLatest] = useState<BindingTarget | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const [locked, setLocked] = useState(false);
  async function remove() {
    if (
      active.current ||
      locked ||
      !catalogReady ||
      !current.binding ||
      !access.can('endpoints.deleteBinding') ||
      !access.can(source.operation)
    )
      return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    const result = await requestApi({
      operation: 'endpoints.deleteBinding',
      params: { id: current.binding.id },
      query: { version: current.binding.version },
      response: emptyResponseSchema,
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    active.current = null;
    setPending(false);
    access.reportResult(result);
    if (result.ok) {
      access.refresh();
      onDeleted();
    } else {
      setLocked(result.uncertain || result.error.code === 'version_conflict');
      setError(result);
    }
  }
  async function read() {
    if (active.current || !access.can(source.operation)) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setLatest(null);
    const result = await source.read(current, controller.signal);
    if (controller.signal.aborted) return;
    active.current = null;
    setPending(false);
    access.reportResult(result);
    if (!result.ok) return setError(result);
    const found = result.data;
    if (found?.binding) setLatest(found);
    else {
      access.refresh();
      onDeleted();
    }
  }
  return (
    <ManagementDialog
      open
      onClose={onClose}
      title={t.remove}
      description={t.deleteDescription}
      onSubmit={() => void remove()}
      pending={pending}
      locked={locked}
      disabled={
        locked ||
        !catalogReady ||
        !current.binding ||
        !access.can('endpoints.deleteBinding') ||
        !access.can(source.operation)
      }
      destructive
      submitLabel={t.confirmDelete}
      actions={
        <>
          {!catalogReady && onRetryDependencies ? (
            <Button variant="outline" onClick={onRetryDependencies}>
              {t.retryDependencies}
            </Button>
          ) : null}
          {locked ? (
            <Button
              variant="outline"
              disabled={pending || !access.can(source.operation)}
              onClick={() => void read()}
            >
              {t.readCurrent}
            </Button>
          ) : null}
        </>
      }
      feedback={
        <>
          <ManagementFeedback error={error} />
          {!catalogReady ? <Banner tone="warning">{t.dependency}</Banner> : null}
          <BindingDeleteCurrent
            latest={latest}
            adopt={() => {
              if (latest && !active.current && access.can(source.operation)) {
                setCurrent(latest);
                setLocked(false);
                setLatest(null);
                setError(null);
              }
            }}
          />
        </>
      }
    >
      <p className="font-mono text-xs break-all">
        {current.operationId} · {current.collectionKey ?? t.global}
      </p>
    </ManagementDialog>
  );
}

function BindingDeleteCurrent({
  latest,
  adopt,
}: {
  latest: BindingTarget | null;
  adopt: () => void;
}) {
  const locale = useShell((state) => state.locale);
  const t = endpointMessages[locale];
  if (!latest) return null;
  return (
    <Banner className="space-y-2">
      <p>
        {t.current}: {latest.binding?.permissionId} · v{latest.binding?.version}
      </p>
      <Button variant="outline" onClick={adopt}>
        {t.adopt}
      </Button>
    </Banner>
  );
}
