'use client';

import { useId, useState } from 'react';
import { Checkbox, Input } from '@new-cms/ui/forms';
import { useShell } from '../../components/shell/shell-provider';
import type { AllowedOperation } from '../../contracts/auth';
import type { Collection } from '../../contracts/content';
import { credentialMessages } from './credential-messages';
import { grantKey, permissionGroups, toggleGrant } from './resource-permission-model';

export function ResourcePermissionEditor({
  grants,
  collections,
  value,
  onChange,
  disabled = false,
}: {
  grants: readonly AllowedOperation[];
  collections: readonly Pick<Collection, 'key' | 'label'>[];
  value: readonly AllowedOperation[];
  onChange: (value: AllowedOperation[]) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const t = credentialMessages[useShell((state) => state.locale)];
  const selected = new Set(value.map(grantKey));
  const search = query.trim().toLocaleLowerCase();
  const groups = permissionGroups(grants, collections)
    .map((group) => ({
      ...group,
      grants: group.grants.filter((grant) =>
        `${group.label} ${grant.collectionKey ?? ''} ${grant.operationId}`
          .toLocaleLowerCase()
          .includes(search),
      ),
    }))
    .filter((group) => group.grants.length > 0);
  return (
    <fieldset className="min-w-0 space-y-3" disabled={disabled} aria-describedby={`${id}-hint`}>
      <legend className="text-sm font-medium">{t.permissions}</legend>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        {t.permissionHint}
      </p>
      <Input
        aria-label={t.search}
        placeholder={t.search}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {t.selected}: {value.length}
      </p>
      <div className="max-h-80 space-y-3 overflow-y-auto rounded-lg border p-3">
        {groups.map((group) => (
          <fieldset key={group.key} className="min-w-0 space-y-2">
            <legend className="mb-2 text-sm font-medium break-all">
              {group.collection ? t.collection : t.system} · {group.label}
            </legend>
            {group.grants.map((grant) => (
              <div
                key={grantKey(grant)}
                className="flex min-w-0 items-start gap-2 rounded-md px-1 py-1.5"
              >
                <Checkbox
                  hideLabel
                  id={`${id}-${group.key}-${grant.operationId}`}
                  checked={selected.has(grantKey(grant))}
                  disabled={disabled}
                  onCheckedChange={(checked) => onChange(toggleGrant(value, grant, checked))}
                  label={`${group.label}: ${grant.operationId}`}
                />
                <label
                  htmlFor={`${id}-${group.key}-${grant.operationId}`}
                  className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center py-2 text-sm break-all"
                >
                  {grant.operationId}
                </label>
              </div>
            ))}
          </fieldset>
        ))}
        {groups.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            {grants.length === 0 ? t.noPermissions : t.noResults}
          </p>
        ) : null}
      </div>
    </fieldset>
  );
}
