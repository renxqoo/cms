'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { requestApi } from '../../api/client';
import type { ApiResult } from '../../api/client';
import { emptyResponseSchema } from '../../contracts/auth';
import type { Permission } from '../../contracts/access';
import { useShell } from '../../components/shell/shell-provider';
import { useAccessControl } from '../access-control/provider';
import { ManagementDialog } from '../management-shared/management-dialog';
import { ManagementFeedback } from '../management-shared/feedback';
import { permissionReadSource } from './permission-read';
import type { PermissionReadSource } from './permission-read';
import { permissionMessages } from './permission-messages';

type Failure = Extract<ApiResult<unknown>, { ok: false }>;

export function PermissionDeleteDialog({
  permission,
  onClose,
  onDeleted,
  source = permissionReadSource,
  onRetryDependencies,
}: {
  permission: Permission;
  onClose: () => void;
  onDeleted: () => void;
  source?: PermissionReadSource;
  onRetryDependencies?: () => void;
}) {
  const locale = useShell((state) => state.locale);
  const t = permissionMessages[locale];
  const access = useAccessControl();
  const [current, setCurrent] = useState(permission);
  const [latest, setLatest] = useState<Permission | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const [locked, setLocked] = useState(false);
  async function remove() {
    if (
      active.current ||
      locked ||
      !access.can('permissions.delete') ||
      source.ready === false ||
      !access.can(source.operation)
    )
      return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    const result = await requestApi({
      operation: 'permissions.delete',
      params: { id: current.id },
      query: { version: current.version },
      response: emptyResponseSchema,
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    active.current = null;
    setPending(false);
    access.reportResult(result);
    if (result.ok) onDeleted();
    else {
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
    const result = await source.find({ id: current.id, signal: controller.signal });
    if (controller.signal.aborted) return;
    active.current = null;
    setPending(false);
    access.reportResult(result);
    if (result.ok) setLatest(result.data);
    else setError(result);
  }
  return (
    <ManagementDialog
      open
      onClose={onClose}
      title={`${t.remove}: ${permission.name}`}
      description={t.deleteDescription}
      onSubmit={() => void remove()}
      pending={pending}
      locked={locked}
      disabled={
        locked ||
        source.ready === false ||
        !access.can('permissions.delete') ||
        !access.can(source.operation)
      }
      destructive
      submitLabel={t.confirmDelete}
      actions={
        <>
          {source.ready === false && onRetryDependencies ? (
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
          {latest ? (
            <Banner className="space-y-2">
              <p>
                {t.current}: {latest.version}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  if (active.current || !access.can(source.operation)) return;
                  setCurrent(latest);
                  setLocked(false);
                  setLatest(null);
                  setError(null);
                }}
              >
                {t.adopt}
              </Button>
            </Banner>
          ) : null}
        </>
      }
    >
      <p className="break-words">
        {current.name} <span className="font-mono text-muted-foreground">{current.code}</span>
      </p>
    </ManagementDialog>
  );
}
