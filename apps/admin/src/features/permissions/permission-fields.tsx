import { Field, Input, NativeSelect, Textarea } from '@new-cms/ui/forms';
import type { Permission } from '../../contracts/access';
import type { Collection } from '../../contracts/content';
import { permissionMessages } from './permission-messages';

export interface PermissionDraft {
  code: string;
  name: string;
  description: string;
  status: 'active' | 'disabled';
  scopeKind: 'global' | 'collection';
  collectionKey: string;
}

export function permissionDraft(value: Permission | null): PermissionDraft {
  return {
    code: value?.code ?? '',
    name: value?.name ?? '',
    description: value?.description ?? '',
    status: value?.status ?? 'active',
    scopeKind: value?.scopeKind ?? 'global',
    collectionKey: value?.collectionKey ?? '',
  };
}

export function PermissionFields({
  value,
  onChange,
  collections,
  creating,
  canDisable,
  locale,
}: {
  value: PermissionDraft;
  onChange: (value: PermissionDraft) => void;
  collections: readonly Pick<Collection, 'key' | 'label'>[] | null;
  creating: boolean;
  canDisable: boolean;
  locale: 'zh' | 'en';
}) {
  const t = permissionMessages[locale];
  return (
    <>
      <Field
        id="permission-code"
        name="code"
        label={t.code}
        description={creating ? t.codeHelp : undefined}
        required
      >
        <Input
          value={value.code}
          readOnly={!creating}
          maxLength={160}
          onChange={(event) => onChange({ ...value, code: event.target.value })}
        />
      </Field>
      <Field id="permission-name" name="name" label={t.name} required>
        <Input
          value={value.name}
          maxLength={128}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
      </Field>
      <Field id="permission-description" name="description" label={t.descriptionField}>
        <Textarea
          value={value.description}
          maxLength={512}
          onChange={(event) => onChange({ ...value, description: event.target.value })}
        />
      </Field>
      <Field id="permission-scope" name="scopeKind" label={t.scope}>
        <NativeSelect
          value={value.scopeKind}
          disabled={!creating}
          onChange={(event) =>
            onChange({
              ...value,
              scopeKind: event.target.value === 'collection' ? 'collection' : 'global',
              collectionKey: '',
            })
          }
        >
          <option value="global">{t.global}</option>
          <option value="collection">{t.collection}</option>
        </NativeSelect>
      </Field>
      {value.scopeKind === 'collection' ? (
        <Field id="permission-collection" name="collectionKey" label={t.collectionKey} required>
          <NativeSelect
            value={value.collectionKey}
            disabled={!creating || collections === null}
            onChange={(event) => onChange({ ...value, collectionKey: event.target.value })}
          >
            <option value="">{t.chooseCollection}</option>
            {value.collectionKey &&
            !collections?.some((item) => item.key === value.collectionKey) ? (
              <option value={value.collectionKey}>{value.collectionKey}</option>
            ) : null}
            {collections?.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label} ({item.key})
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
      {!creating ? (
        <Field id="permission-status" name="status" label={t.status}>
          <NativeSelect
            value={value.status}
            onChange={(event) =>
              onChange({
                ...value,
                status: event.target.value === 'disabled' ? 'disabled' : 'active',
              })
            }
          >
            <option value="active">{t.active}</option>
            <option value="disabled" disabled={!canDisable}>
              {t.disabled}
            </option>
          </NativeSelect>
        </Field>
      ) : null}
    </>
  );
}
