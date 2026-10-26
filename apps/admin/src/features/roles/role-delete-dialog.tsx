'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { requestApi } from '../../api/client';
import type { ApiResult } from '../../api/client';
import { emptyResponseSchema } from '../../contracts/auth';
import { roleDetailSchema } from '../../contracts/access';
import type { Role } from '../../contracts/access';
import { useShell } from '../../components/shell/shell-provider';
import { useAccessControl } from '../access-control/provider';
import { ManagementDialog } from '../management-shared/management-dialog';
import { ManagementFeedback } from '../management-shared/feedback';
import { roleMessages } from './role-messages';

type Failure = Extract<ApiResult<unknown>, { ok: false }>;

export function RoleDeleteDialog({
  role,
  onClose,
  onDeleted,
}: {
  role: Role;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const locale = useShell((state) => state.locale);
  const t = roleMessages[locale];
  const access = useAccessControl();
  const [current, setCurrent] = useState(role);
  const [latest, setLatest] = useState<Role | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const [locked, setLocked] = useState(false);
  async function remove() {
    if (
      active.current ||
      locked ||
      current.isSuper ||
      !access.can('roles.delete') ||
      !access.can('roles.get')
    )
      return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    const result = await requestApi({
      operation: 'roles.delete',
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
    if (active.current || !access.can('roles.get')) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setLatest(null);
    const result = await requestApi({
      operation: 'roles.get',
      params: { id: current.id },
      response: roleDetailSchema,
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    active.current = null;
    setPending(false);
    access.reportResult(result);
    if (result.ok) setLatest(result.data);
    else setError(result);
  }
  const actions = locked ? (
    <Button
      variant="outline"
      disabled={pending || !access.can('roles.get')}
      onClick={() => void read()}
    >
      {t.reload}
    </Button>
  ) : null;
  return (
    <ManagementDialog
      open
      onClose={onClose}
      title={`${t.deleteTitle}: ${role.name}`}
      description={t.deleteDescription}
      onSubmit={() => void remove()}
      locked={locked}
      pending={pending}
      disabled={
        locked || current.isSuper || !access.can('roles.delete') || !access.can('roles.get')
      }
      destructive
      submitLabel={t.confirmDelete}
      actions={actions}
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
                  if (active.current || !access.can('roles.get')) return;
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
