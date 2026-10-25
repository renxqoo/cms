'use client';

import { Button } from '@new-cms/ui/actions';
import { Field, NativeSelect } from '@new-cms/ui/forms';
import { roleListSchema } from '../../contracts/access';
import type { RoleListItem } from '../../contracts/access';
import { useAllPagesQuery } from '../management-shared/query';
import { useAccessControl } from '../access-control/provider';
import { ManagementFeedback } from '../management-shared/feedback';
import type { AdminsMessages } from './admins-messages';

function rowKey(row: RoleListItem) {
  return row.id;
}

export function useAdminRoles(enabled = true) {
  const access = useAccessControl();
  return useAllPagesQuery({
    operation: 'roles.list',
    response: roleListSchema,
    key: rowKey,
    enabled: enabled && access.can('roles.list'),
  });
}

export function RoleField({
  roles,
  current,
  disabled,
  value,
  onChange,
  error,
  messages: t,
}: {
  roles: ReturnType<typeof useAdminRoles>;
  current?: { id: string; code: string };
  disabled: boolean;
  value?: string;
  onChange?: (value: string) => void;
  error?: string | undefined;
  messages: AdminsMessages;
}) {
  const rows = roles.data ?? [];
  const missingCurrent = current && !rows.some((role) => role.id === current.id);
  return (
    <div className="space-y-2">
      <Field id="admin-role" name="roleId" label={t.role} error={error} required>
        <NativeSelect
          className="w-full"
          disabled={disabled || roles.phase !== 'ready'}
          {...(value === undefined ? { defaultValue: '' } : { value })}
          onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        >
          <option value="" disabled>
            {t.noRole}
          </option>
          {missingCurrent ? (
            <option value={current.id} disabled>
              {current.code} · {t.roleUnavailable}
            </option>
          ) : null}
          {rows.map((role) => (
            <option key={role.id} value={role.id} disabled={role.status !== 'active'}>
              {role.name} ({role.code}){role.status === 'disabled' ? ` · ${t.roleDisabled}` : ''}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <ManagementFeedback error={roles.error} onRetry={roles.reload} />
      {roles.phase === 'loading' ? (
        <p className="text-xs text-muted-foreground">{t.loading}</p>
      ) : null}
      {roles.phase === 'idle' ? (
        <p className="text-xs text-muted-foreground">{t.readDependency}</p>
      ) : null}
      {roles.phase === 'failed' ? (
        <Button variant="outline" size="sm" onClick={roles.reload}>
          {t.rolesRetry}
        </Button>
      ) : null}
    </div>
  );
}
