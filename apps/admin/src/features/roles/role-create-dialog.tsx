'use client';

import { useEffect, useRef, useState } from 'react';
import { Banner } from '@new-cms/ui/feedback';
import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/client';
import { roleDetailSchema } from '../../contracts/access';
import type { Permission, RoleDetail } from '../../contracts/access';
import { useShell } from '../../components/shell/shell-provider';
import { useAccessControl } from '../access-control/provider';
import { ManagementDialog } from '../management-shared/management-dialog';
import { ManagementFeedback } from '../management-shared/feedback';
import { PermissionPicker } from '../permissions/permission-picker';
import { createRoleSchema, roleFormValues } from './role-model';
import { RoleFields } from './role-fields';
import { roleMessages } from './role-messages';

type Failure = Extract<ApiResult<unknown>, { ok: false }>;
interface CreateInput {
  code: string;
  name: string;
  description: string | null;
  permissionIds: string[];
}

export function RoleCreateDialog({
  permissions,
  onClose,
  onCreated,
}: {
  permissions: readonly Permission[] | null;
  onClose: () => void;
  onCreated: (role: RoleDetail) => void;
}) {
  const locale = useShell((state) => state.locale);
  const t = roleMessages[locale];
  const access = useAccessControl();
  const [grants, setGrants] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const active = useRef<AbortController | null>(null);
  const intent = useRef<{ body: CreateInput; key: string; fingerprint: string } | null>(null);
  const uncertain = useRef(false);
  useEffect(() => () => active.current?.abort(), []);
  const locked = error?.uncertain === true;
  async function submit(form: FormData) {
    if (active.current || !access.can('roles.create') || permissions === null) return;
    const parsed = createRoleSchema.safeParse({ code: form.get('code'), ...roleFormValues(form) });
    const body = uncertain.current
      ? intent.current?.body
      : parsed.success
        ? { ...parsed.data, permissionIds: grants }
        : null;
    if (!body || grants.length > 2000) return setError(failure('invalid_input', 400));
    const fingerprint = JSON.stringify(body);
    if (intent.current?.fingerprint !== fingerprint)
      intent.current = { body, key: crypto.randomUUID(), fingerprint };
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    const result = await requestApi({
      operation: 'roles.create',
      body,
      response: roleDetailSchema,
      signal: controller.signal,
      idempotencyKey: intent.current.key,
    });
    if (controller.signal.aborted) return;
    active.current = null;
    setPending(false);
    uncertain.current = !result.ok && result.uncertain;
    access.reportResult(result);
    if (result.ok) onCreated(result.data);
    else setError(result);
  }
  return (
    <ManagementDialog
      open
      onClose={onClose}
      title={t.create}
      onSubmit={(form) => void submit(form)}
      pending={pending}
      locked={locked}
      disabled={permissions === null || !access.can('roles.create')}
      submitLabel={locked ? t.retrySame : t.create}
      feedback={
        <>
          <ManagementFeedback error={error} />
          {permissions === null ? <Banner tone="warning">{t.dependency}</Banner> : null}
        </>
      }
    >
      <RoleFields locale={locale} creating />
      {permissions ? (
        <PermissionPicker
          permissions={permissions}
          value={grants}
          onChange={(value) => {
            if (!active.current && !uncertain.current) setGrants(value);
          }}
        />
      ) : null}
    </ManagementDialog>
  );
}
