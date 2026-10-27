'use client';
import { useId, useState } from 'react';
import { z } from 'zod';
import { Button } from '@new-cms/ui/actions';
import { Input } from '@new-cms/ui/forms';
import { useShell } from '../../components/shell/shell-provider';
import { presetAccessSchema, queryPresetSchema } from '../../contracts/query-presets';
import type { PresetAccess, QueryPreset } from '../../contracts/query-presets';
import { useAccessControl } from '../access-control/provider';
import { useContentMutation } from './use-content-mutation';
import { PresetFeedback } from './preset-feedback';
import { PresetAccessEditor } from './preset-access-editor';
import { presetCandidateKey } from './preset-candidate';
import type { PresetValidity } from './preset-candidate';
import type { PresetValues } from './query-preset-create';
import { queryMessages } from './query-messages';
export function PresetActions({
  row,
  query,
  collection,
  valid,
  reload,
  contentLocale,
}: PresetValues & { row: QueryPreset }) {
  const locale = useShell((state) => state.locale);
  const t = queryMessages[locale];
  const access = useAccessControl();
  const scope = { scopeKind: 'collection', collectionKey: collection.key } as const;
  const mutation = useContentMutation();
  const id = useId();
  const [name, setName] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [rules, setRules] = useState<PresetAccess>(row.access);
  const [validation, setValidation] = useState<PresetValidity | null>(null);
  const disabled = mutation.pending || mutation.locked || !valid;
  const context = {
    collection,
    name: row.name,
    query: row.query,
    locale: contentLocale,
    source: { id: row.id, version: row.version },
  };
  const checked =
    validation?.key === presetCandidateKey(context, rules, access.principal.id) && validation.valid;
  function changed() {
    reload();
    setName(null);
    setDeleting(false);
    setSharing(false);
  }
  if (!row.permissions.update && !row.permissions.delete) return null;
  return (
    <div className="space-y-3">
      <PresetFeedback
        mutation={mutation}
        collection={collection}
        reload={reload}
        contentLocale={contentLocale}
      />
      <PresetButtons
        row={row}
        collectionKey={collection.key}
        disabled={disabled}
        sharing={sharing}
        deleting={deleting}
        id={id}
        edit={() => setName(row.name)}
        share={() => setSharing(!sharing)}
        remove={() => {
          if (!deleting) {
            setDeleting(true);
            return;
          }
          void mutation.run(
            {
              operation: 'queryPresets.delete',
              params: { collection: collection.key, id: row.id },
              query: { version: row.version, locale: contentLocale },
              response: z.undefined(),
            },
            changed,
          );
        }}
      />
      {sharing && access.can('queryPresets.share', scope) && row.permissions.update ? (
        <div id={`${id}-sharing`} className="space-y-3">
          <PresetAccessEditor
            value={rules}
            context={context}
            change={setRules}
            validity={setValidation}
            readOnly={disabled}
          />
          <Button
            disabled={disabled || !checked || !presetAccessSchema.safeParse(rules).success}
            onClick={() =>
              void mutation.run(
                {
                  operation: 'queryPresets.share',
                  params: { collection: collection.key, id: row.id },
                  body: { version: row.version, access: rules, locale: contentLocale },
                  response: queryPresetSchema,
                },
                changed,
              )
            }
          >
            {t.save}
          </Button>
        </div>
      ) : null}
      {name !== null ? (
        <form
          className="flex w-full flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (disabled || !name.trim()) return;
            void mutation.run(
              {
                operation: 'queryPresets.update',
                params: { collection: collection.key, id: row.id },
                body: { version: row.version, name, query, locale: contentLocale },
                response: queryPresetSchema,
              },
              changed,
            );
          }}
        >
          <Input
            aria-label={t.name}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            disabled={disabled}
          />
          <Button type="submit" disabled={disabled || !name.trim()}>
            {t.update}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

interface PresetButtonsProps {
  row: QueryPreset;
  collectionKey: string;
  disabled: boolean;
  sharing: boolean;
  deleting: boolean;
  id: string;
  edit: () => void;
  share: () => void;
  remove: () => void;
}
function PresetButtons(props: PresetButtonsProps) {
  const access = useAccessControl();
  const locale = useShell((state) => state.locale);
  const t = queryMessages[locale];
  const scope = { scopeKind: 'collection', collectionKey: props.collectionKey } as const;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {access.can('queryPresets.update', scope) && props.row.permissions.update ? (
        <Button variant="ghost" disabled={props.disabled} onClick={props.edit}>
          {t.update}
        </Button>
      ) : null}
      {access.can('queryPresets.share', scope) && props.row.permissions.update ? (
        <Button
          variant="ghost"
          disabled={props.disabled}
          aria-expanded={props.sharing}
          aria-controls={`${props.id}-sharing`}
          onClick={props.share}
        >
          {t.shared}
        </Button>
      ) : null}
      {access.can('queryPresets.delete', scope) && props.row.permissions.delete ? (
        <Button
          variant={props.deleting ? 'destructive' : 'ghost'}
          disabled={props.disabled}
          onClick={props.remove}
        >
          {props.deleting ? `${t.delete} · ${props.row.name}` : t.delete}
        </Button>
      ) : null}
    </div>
  );
}
