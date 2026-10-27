'use client';
import { useEffect, useEffectEvent, useId, useState } from 'react';
import { Field, NativeSelect } from '@new-cms/ui/forms';
import { useShell } from '../../components/shell/shell-provider';
import { collectionListSchema } from '../../contracts/content';
import { presetAccessSchema } from '../../contracts/query-presets';
import type { PresetAccess, PresetEditor } from '../../contracts/query-presets';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { QueryPresetCustomFields } from './query-preset-custom-fields';
import { customPresetActions, presetCandidateKey } from './preset-candidate';
import type { PresetAction, PresetCandidateContext, PresetValidity } from './preset-candidate';
import { PresetUsers } from './preset-users';
import { queryMessages } from './query-messages';
export function privatePresetAccess(id: string): PresetAccess {
  return {
    read: { constraint: 'onlyMe', users: [id] },
    update: { constraint: 'onlyMe', users: [id] },
    delete: { constraint: 'onlyMe', users: [id] },
  };
}
interface Props {
  value: PresetAccess;
  context: PresetCandidateContext;
  readOnly: boolean;
  change: (value: PresetAccess | ((previous: PresetAccess) => PresetAccess)) => void;
  validity: (value: PresetValidity) => void;
}
export function PresetAccessEditor(props: Props) {
  const { principal } = useAccessControl();
  return <AccessRules key={principal.id} {...props} />;
}
function AccessRules(props: Props) {
  const access = useAccessControl();
  const locale = useShell((state) => state.locale);
  const t = queryMessages[locale];
  const prefix = useId();
  const [reports, setReports] = useState<Partial<Record<PresetAction, PresetValidity>>>({});
  const [choices, setChoices] = useState<
    Partial<Record<PresetAction, { key: string; values: PresetEditor['constraints'] }>>
  >({});
  const custom = customPresetActions(props.context.collection, props.value);
  const key = presetCandidateKey(props.context, props.value, access.principal.id);
  const catalog = useApiQuery({
    operation: 'collections.list',
    response: collectionListSchema,
    enabled: custom.length > 0 && !props.readOnly && access.can('collections.list'),
  });
  const valid =
    presetAccessSchema.safeParse(props.value).success &&
    (['read', 'update', 'delete'] as const).every(
      (action) => reports[action]?.key === key && reports[action]?.valid,
    );
  const report = useEffectEvent((snapshot: PresetValidity) => props.validity(snapshot));
  useEffect(() => {
    report({ key, valid });
  }, [key, valid]);
  const labels = { read: t.readAccess, update: t.updateAccess, delete: t.deleteAccess };
  return (
    <div className="grid min-w-0 gap-4">
      {(['read', 'update', 'delete'] as const).map((action) => {
        const rule = props.value[action];
        const options = (choices[action]?.key === key
          ? choices[action].values
          : props.context.collection.queryPresetConstraints?.[action]) ?? [
          { value: 'everyone', label: t.everyoneAccess },
          { value: 'onlyMe', label: t.onlyMeAccess },
          { value: 'specificUsers', label: t.specificAccess },
        ];
        return (
          <section key={action} className="min-w-0 space-y-3" aria-label={labels[action]}>
            <Field id={`${prefix}-${action}`} label={labels[action]}>
              <NativeSelect
                disabled={props.readOnly}
                value={rule.constraint}
                onChange={(event) =>
                  props.change({
                    ...props.value,
                    [action]: {
                      constraint: event.currentTarget.value,
                      ...(event.currentTarget.value === 'onlyMe'
                        ? { users: [access.principal.id] }
                        : {}),
                    },
                  })
                }
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value === 'everyone'
                      ? t.everyoneAccess
                      : option.value === 'onlyMe'
                        ? t.onlyMeAccess
                        : option.value === 'specificUsers'
                          ? t.specificAccess
                          : option.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {rule.constraint === 'specificUsers' ? (
              <PresetUsers
                id={`${prefix}-${action}-users`}
                label={t.accessUsers}
                value={rule.users ?? []}
                readOnly={props.readOnly}
                change={(users) => props.change({ ...props.value, [action]: { ...rule, users } })}
              />
            ) : null}
            <QueryPresetCustomFields
              context={props.context}
              action={action}
              access={props.value}
              collections={catalog.data?.rows ?? [props.context.collection]}
              readOnly={props.readOnly}
              change={(value) => props.change((previous) => ({ ...previous, [action]: value }))}
              options={(values) =>
                setChoices((before) => ({ ...before, [action]: { key, values } }))
              }
              validity={(ready) =>
                setReports((before) =>
                  before[action]?.key === key && before[action]?.valid === ready
                    ? before
                    : { ...before, [action]: { key, valid: ready } },
                )
              }
            />
          </section>
        );
      })}
    </div>
  );
}
