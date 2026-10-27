'use client';
import { useCallback } from 'react';
import { Field, Input, Select } from '@new-cms/ui/forms';
import { requestApi } from '../../api/client';
import { adminListSchema } from '../../contracts/access';
import { useAccessControl } from '../access-control/provider';
import { useShell } from '../../components/shell/shell-provider';
import { fieldSorting } from '../fields/sorting';
import { fieldMessages } from '../fields/field-messages';
import { queryMessages } from './query-messages';
interface Props {
  id: string;
  value: readonly string[];
  label: string;
  readOnly: boolean;
  change: (value: string[]) => void;
}
export function PresetUsers(props: Props) {
  const access = useAccessControl();
  const locale = useShell((state) => state.locale);
  const t = queryMessages[locale];
  const fields = fieldMessages[locale];
  const { reportResult } = access;
  const allowed = access.can('admins.list');
  const load = useCallback(
    async ({ query, signal }: { query: string; signal: AbortSignal }) => {
      const result = await requestApi({
        operation: 'admins.list',
        query: { q: query, page: 1, pageSize: 20, sortBy: 'displayName', order: 'asc' },
        response: adminListSchema,
        signal,
      });
      if (signal.aborted) return { status: 'error' as const, message: t.directoryUnavailable };
      if (!result.ok) {
        reportResult(result);
        return { status: 'error' as const, message: t.directoryUnavailable };
      }
      return {
        status: 'success' as const,
        options: result.data.rows.map((admin) => ({
          value: admin.id,
          label: admin.displayName ? `${admin.displayName} · ${admin.email}` : admin.email,
          disabled: admin.status !== 'active',
        })),
      };
    },
    [reportResult, t.directoryUnavailable],
  );
  return (
    <Field id={props.id} label={props.label} description={!allowed ? t.directoryDenied : undefined}>
      {allowed ? (
        <Select
          key={access.principal.id}
          multiple
          label={props.label}
          value={props.value}
          options={[]}
          onChange={props.change}
          loadOptions={load}
          placeholder={t.userSearch}
          emptyLabel={fields.empty}
          loadingLabel={fields.loading}
          errorLabel={t.directoryUnavailable}
          clearLabel={fields.clear}
          removeLabel={(label) => `${fields.remove} ${label}`}
          readOnly={props.readOnly}
          sorting={fieldSorting(fields, props.label)}
        />
      ) : (
        <Input
          value={props.value.join(', ')}
          readOnly={props.readOnly}
          onChange={(event) =>
            props.change(
              event.currentTarget.value
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean),
            )
          }
        />
      )}
    </Field>
  );
}
