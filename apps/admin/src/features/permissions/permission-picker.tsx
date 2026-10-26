'use client';

import { useState } from 'react';
import { Checkbox, Input } from '@new-cms/ui/forms';
import { Pill } from '@new-cms/ui/feedback';
import { useShell } from '../../components/shell/shell-provider';
import type { Permission } from '../../contracts/access';
import { roleMessages } from '../roles/role-messages';

export function PermissionPicker({
  permissions,
  value,
  onChange,
  disabled = false,
}: {
  permissions: readonly Permission[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const locale = useShell((state) => state.locale);
  const t = roleMessages[locale];
  const search = query.toLocaleLowerCase();
  const visible = permissions.filter((item) =>
    `${item.code} ${item.name}`.toLocaleLowerCase().includes(search),
  );
  const missing = value.filter((id) => !permissions.some((permission) => permission.id === id));
  function toggle(id: string, checked: boolean) {
    onChange(
      checked ? [...value.filter((item) => item !== id), id] : value.filter((item) => item !== id),
    );
  }
  return (
    <div className="space-y-3">
      <Input
        aria-label={t.searchGrants}
        placeholder={t.searchGrants}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        disabled={disabled}
      />
      <p className="text-xs text-muted-foreground">
        {t.selected}: {value.length}
      </p>
      <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg border p-2">
        {visible.map((permission) => (
          <div
            key={permission.id}
            className="flex items-start gap-3 rounded-md p-2 hover:bg-muted/50"
          >
            <Checkbox
              checked={value.includes(permission.id)}
              disabled={
                disabled || (permission.status === 'disabled' && !value.includes(permission.id))
              }
              onCheckedChange={(checked) => toggle(permission.id, checked)}
              label={`${permission.name} (${permission.code})`}
            />
            <span className="min-w-0 flex-1 space-y-1">
              <span className="block text-sm font-medium">{permission.name}</span>
              <span className="block text-xs break-all text-muted-foreground">
                {permission.code} · {permission.collectionKey ?? 'global'}
              </span>
            </span>
            {permission.status === 'disabled' ? <Pill tone="warning">{t.disabled}</Pill> : null}
          </div>
        ))}
        {missing.map((id) => (
          <div key={id} className="flex items-start gap-3 p-2">
            <Checkbox
              checked
              disabled={disabled}
              onCheckedChange={() => toggle(id, false)}
              label={`${t.unavailable}: ${id}`}
            />
            <span className="text-sm break-all text-destructive">
              {t.unavailable}: {id}
            </span>
          </div>
        ))}
        {visible.length === 0 && missing.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">{t.noPermissions}</p>
        ) : null}
      </div>
    </div>
  );
}
