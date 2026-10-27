'use client';

import { useState } from 'react';
import { Checkbox } from '@new-cms/ui/forms';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { useShell } from '../../components/shell/shell-provider';
import type { Endpoint, Permission } from '../../contracts/access';
import { useAccessControl } from '../access-control/provider';
import { ManagementDialog } from '../management-shared/management-dialog';
import { ManagementFeedback } from '../management-shared/feedback';
import type { Collection } from '../../contracts/content';
import { PermissionFields } from './permission-fields';
import type { PermissionDraft } from './permission-fields';
import { permissionChanges, permissionCollections } from './permission-model';
import { permissionReadSource } from './permission-read';
import type { PermissionReadSource } from './permission-read';
import { usePermissionEditor } from './use-permission-editor';
import { permissionMessages } from './permission-messages';

function enteredDraft(form: FormData, draft: PermissionDraft): PermissionDraft {
  const name = form.get('name');
  const description = form.get('description');
  const code = form.get('code');
  return {
    ...draft,
    name: typeof name === 'string' ? name : draft.name,
    description: typeof description === 'string' ? description : draft.description,
    code: typeof code === 'string' ? code : draft.code,
  };
}

interface DialogProps {
  permission: Permission | null;
  endpoints: Endpoint[] | null;
  collections: Pick<Collection, 'key' | 'label'>[] | null;
  onClose: () => void;
  onSaved: (permission: Permission) => void;
  source?: PermissionReadSource;
  onRetryDependencies?: () => void;
  onRequireEndpointCatalog?: () => void;
}

type Flow = ReturnType<typeof usePermissionEditor>;

export function PermissionDialog(props: DialogProps) {
  const source = props.source ?? permissionReadSource;
  const flow = usePermissionEditor(props.permission, props.onSaved, source);
  const [acknowledged, setAcknowledged] = useState(false);
  const disabling = flow.current?.status === 'active' && flow.draft.status === 'disabled';
  const access = useAccessControl();
  const locale = useShell((state) => state.locale);
  const t = permissionMessages[locale];
  const collections = permissionCollections(props);
  const policy = dialogPolicy({
    ...props,
    collections,
    flow,
    canRead: access.can(source.operation) && source.ready !== false,
  });
  const cannotWrite = !access.can(props.permission ? 'permissions.update' : 'permissions.create');
  return (
    <ManagementDialog
      open
      title={props.permission ? t.edit : t.create}
      onClose={props.onClose}
      onSubmit={(form) => void flow.save(enteredDraft(form, flow.draft))}
      pending={policy.pending}
      locked={policy.locked}
      disabled={policy.disabled || cannotWrite || (disabling && !acknowledged)}
      submitLabel={!props.permission && policy.locked ? t.retrySame : t.save}
      actions={
        <PermissionDialogActions
          permission={props.permission}
          flow={flow}
          source={source}
          dependency={policy.dependency || (props.permission !== null && !policy.canDisable)}
          retry={props.onRetryDependencies}
        />
      }
      feedback={
        <PermissionFeedback flow={flow} policy={policy} editing={props.permission !== null} />
      }
    >
      <PermissionFields
        value={flow.draft}
        onChange={(draft) => {
          flow.setDraft(draft);
          if (draft.scopeKind === 'collection') props.onRequireEndpointCatalog?.();
        }}
        collections={collections}
        creating={!props.permission}
        canDisable={policy.canDisable}
        locale={locale}
      />
      {disabling ? (
        <Checkbox
          checked={acknowledged}
          onCheckedChange={setAcknowledged}
          label={t.confirmDisable}
        />
      ) : null}
    </ManagementDialog>
  );
}

function dialogPolicy(
  input: Pick<DialogProps, 'permission' | 'endpoints' | 'collections'> & {
    flow: Flow;
    canRead: boolean;
  },
) {
  const { permission, flow } = input;
  const canDisable = permission === null || input.endpoints !== null;
  const locked = flow.phase === 'unconfirmed' || flow.phase === 'reading';
  const pending = flow.phase === 'saving' || flow.phase === 'reading';
  const dependency =
    !input.canRead ||
    (!permission && flow.draft.scopeKind === 'collection' && input.collections === null);
  const unsafeDisable =
    flow.current?.status === 'active' && flow.draft.status === 'disabled' && !canDisable;
  const unchanged =
    flow.current !== null &&
    Object.keys(
      permissionChanges(flow.current, {
        name: flow.draft.name.trim(),
        description: flow.draft.description || null,
        status: flow.draft.status,
      }),
    ).length === 0;
  return {
    canDisable,
    locked,
    pending,
    dependency,
    disabled: unchanged || disableSubmission({ dependency, unsafeDisable, permission, locked }),
  };
}

function disableSubmission(input: {
  dependency: boolean;
  unsafeDisable: boolean | undefined;
  permission: Permission | null;
  locked: boolean;
}) {
  return (
    input.dependency || input.unsafeDisable === true || (input.permission !== null && input.locked)
  );
}

function PermissionFeedback({
  flow,
  policy,
  editing,
}: {
  flow: Flow;
  policy: ReturnType<typeof dialogPolicy>;
  editing: boolean;
}) {
  const locale = useShell((state) => state.locale);
  const t = permissionMessages[locale];
  return (
    <>
      <ManagementFeedback error={flow.error} />
      {policy.locked && editing ? <Banner tone="warning">{t.conflict}</Banner> : null}
      {policy.dependency ? <Banner tone="warning">{t.dependency}</Banner> : null}
      {editing && !policy.canDisable ? (
        <Banner tone="warning">{t.incompleteBindings}</Banner>
      ) : null}
      <PermissionCurrent latest={flow.latest} adopt={flow.adoptCurrent} />
    </>
  );
}

function PermissionCurrent({ latest, adopt }: { latest: Permission | null; adopt: () => void }) {
  const locale = useShell((state) => state.locale);
  const t = permissionMessages[locale];
  if (!latest) return null;
  return (
    <Banner className="space-y-3">
      <p>
        {t.current}: {latest.version}
      </p>
      <pre className="max-h-52 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
        {JSON.stringify(
          { name: latest.name, description: latest.description, status: latest.status },
          null,
          2,
        )}
      </pre>
      <Button variant="outline" onClick={adopt}>
        {t.adopt}
      </Button>
    </Banner>
  );
}

function PermissionDialogActions({
  permission,
  flow,
  source,
  dependency,
  retry,
}: {
  permission: Permission | null;
  flow: Flow;
  source: PermissionReadSource;
  dependency: boolean;
  retry: (() => void) | undefined;
}) {
  const access = useAccessControl();
  const t = permissionMessages[useShell((state) => state.locale)];
  const locked = flow.phase === 'unconfirmed' || flow.phase === 'reading';
  return (
    <>
      {permission && locked ? (
        <Button
          variant="outline"
          disabled={flow.phase === 'reading' || !access.can(source.operation)}
          onClick={() => void flow.readCurrent()}
        >
          {t.readCurrent}
        </Button>
      ) : null}
      {dependency && retry ? (
        <Button variant="outline" onClick={retry}>
          {t.retryDependencies}
        </Button>
      ) : null}
    </>
  );
}
