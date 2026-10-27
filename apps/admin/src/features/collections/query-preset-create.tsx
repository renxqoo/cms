'use client';
import { useId, useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Field, Input } from '@new-cms/ui/forms';
import { useShell } from '../../components/shell/shell-provider';
import { presetAccessSchema, queryPresetSchema } from '../../contracts/query-presets';
import type { PresetAccess, QueryPreset } from '../../contracts/query-presets';
import type { Collection } from '../../contracts/content';
import { useAccessControl } from '../access-control/provider';
import { useContentMutation } from './use-content-mutation';
import { PresetFeedback } from './preset-feedback';
import { PresetAccessEditor, privatePresetAccess } from './preset-access-editor';
import { presetCandidateKey } from './preset-candidate';
import type { PresetValidity } from './preset-candidate';
import { queryMessages } from './query-messages';
export interface PresetValues {
  query: QueryPreset['query'];
  collection: Collection;
  valid: boolean;
  reload: () => void;
  contentLocale: string;
}
export function CreatePresetForm({
  query,
  collection,
  valid,
  reload,
  contentLocale,
}: PresetValues) {
  const locale = useShell((state) => state.locale);
  const t = queryMessages[locale];
  const access = useAccessControl();
  const id = useId();
  const scope = { scopeKind: 'collection', collectionKey: collection.key } as const;
  const mutation = useContentMutation();
  const [name, setName] = useState('');
  const [rules, setRules] = useState<PresetAccess>(() => privatePresetAccess(access.principal.id));
  const [validation, setValidation] = useState<PresetValidity | null>(null);
  const context = { collection, name, query, locale: contentLocale };
  const checked =
    (!access.can('queryPresets.share', scope) &&
      (['read', 'update', 'delete'] as const).every(
        (action) =>
          rules[action].constraint === 'onlyMe' &&
          rules[action].users?.length === 1 &&
          rules[action].users?.[0] === access.principal.id,
      )) ||
    (validation?.key === presetCandidateKey(context, rules, access.principal.id) &&
      validation.valid);
  const disabled =
    mutation.pending ||
    mutation.locked ||
    !valid ||
    !checked ||
    !presetAccessSchema.safeParse(rules).success;
  if (!access.can('queryPresets.create', scope)) return null;
  return (
    <form
      className="space-y-3 rounded-md border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled || !name.trim()) return;
        void mutation.run(
          {
            operation: 'queryPresets.create',
            params: { collection: collection.key },
            body: { name, access: rules, query, locale: contentLocale },
            idempotencyKey: crypto.randomUUID(),
            response: queryPresetSchema,
          },
          () => {
            setName('');
            setRules(privatePresetAccess(access.principal.id));
            setValidation(null);
            reload();
          },
        );
      }}
    >
      <PresetFeedback
        mutation={mutation}
        collection={collection}
        reload={reload}
        contentLocale={contentLocale}
      />
      <Field id={`${id}-name`} label={t.name}>
        <Input
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          maxLength={128}
          disabled={mutation.pending || mutation.locked}
        />
      </Field>
      {access.can('queryPresets.share', scope) ? (
        <>
          <PresetAccessEditor
            value={rules}
            context={context}
            change={setRules}
            validity={setValidation}
            readOnly={mutation.pending || mutation.locked}
          />
        </>
      ) : null}
      <Button type="submit" disabled={disabled || !name.trim()}>
        {t.save}
      </Button>
    </form>
  );
}
