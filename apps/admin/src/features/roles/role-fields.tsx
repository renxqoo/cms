import { Field, Input, NativeSelect, Textarea } from '@new-cms/ui/forms';
import type { RoleValues } from './role-model';
import { roleMessages } from './role-messages';

export function RoleFields({
  locale,
  values,
  onChange,
  creating = false,
}: {
  locale: 'zh' | 'en';
  values?: RoleValues;
  onChange?: (values: RoleValues) => void;
  creating?: boolean;
}) {
  const t = roleMessages[locale];
  return (
    <>
      {creating ? (
        <Field id="role-code" name="code" label={t.code} description={t.codeHelp} required>
          <Input pattern={'[a-z][a-z0-9_\\-]{0,63}'} maxLength={64} autoComplete="off" />
        </Field>
      ) : null}
      <Field id="role-name" name="name" label={t.name} required>
        <Input
          maxLength={128}
          value={values?.name}
          onChange={
            onChange && values
              ? (event) => onChange({ ...values, name: event.target.value })
              : undefined
          }
        />
      </Field>
      <Field id="role-description" name="description" label={t.descriptionField}>
        <Textarea
          maxLength={512}
          value={values ? (values.description ?? '') : undefined}
          onChange={
            onChange && values
              ? (event) => onChange({ ...values, description: event.target.value || null })
              : undefined
          }
        />
      </Field>
      {!creating ? (
        <Field id="role-status" name="status" label={t.status}>
          <NativeSelect
            value={values?.status}
            onChange={
              onChange && values
                ? (event) =>
                    onChange({
                      ...values,
                      status: event.target.value === 'disabled' ? 'disabled' : 'active',
                    })
                : undefined
            }
          >
            <option value="active">{t.active}</option>
            <option value="disabled">{t.disabled}</option>
          </NativeSelect>
        </Field>
      ) : null}
    </>
  );
}
