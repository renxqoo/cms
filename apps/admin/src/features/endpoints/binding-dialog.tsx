'use client';

import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { Field, NativeSelect } from '@new-cms/ui/forms';
import { useShell } from '../../components/shell/shell-provider';
import type { Endpoint, Permission } from '../../contracts/access';
import { useAccessControl } from '../access-control/provider';
import { ManagementDialog } from '../management-shared/management-dialog';
import { ManagementFeedback } from '../management-shared/feedback';
import { eligiblePermissions } from '../permissions/permission-model';
import { endpointReadSource } from './binding-read';
import type { EndpointReadSource } from './binding-read';
import { useBindingEditor } from './use-binding-editor';
import { endpointMessages } from './endpoint-messages';

export function BindingDialog({
  endpoint,
  permissions,
  catalogReady,
  onClose,
  onSaved,
  onRetryDependencies,
  source = endpointReadSource,
}: {
  endpoint: Endpoint;
  permissions: Permission[] | null;
  catalogReady: boolean;
  onRetryDependencies?: () => void;
  onClose: () => void;
  onSaved: () => void;
  source?: EndpointReadSource;
}) {
  const flow = useBindingEditor(endpoint, onSaved, source);
  const access = useAccessControl();
  const locale = useShell((state) => state.locale);
  const t = endpointMessages[locale];
  const { options, locked, pending, disabled, dependency } = bindingDialogState({
    flow,
    permissions,
    catalogReady,
    access,
    source,
  });
  return (
    <ManagementDialog
      open
      title={flow.current.binding ? t.edit : t.create}
      onClose={onClose}
      pending={pending}
      locked={locked}
      disabled={disabled}
      onSubmit={() => {
        if (permissions) void flow.save(permissions);
      }}
      submitLabel={!flow.current.binding && locked ? t.retrySame : t.save}
      actions={
        <>
          {!catalogReady && onRetryDependencies ? (
            <Button variant="outline" onClick={onRetryDependencies}>
              {t.retryDependencies}
            </Button>
          ) : null}
          {locked ? (
            <Button
              variant="outline"
              disabled={pending || !access.can(source.operation)}
              onClick={() => void flow.readCurrent()}
            >
              {t.readCurrent}
            </Button>
          ) : null}
        </>
      }
      feedback={
        <>
          <ManagementFeedback error={flow.error} />
          {dependency ? <Banner tone="warning">{t.dependency}</Banner> : null}
          <BindingCurrent flow={flow} onMatched={onSaved} />
        </>
      }
    >
      <p className="font-mono text-xs break-all">
        {flow.current.operationId} · {flow.current.collectionKey ?? t.global}
      </p>
      <BindingPermissionField flow={flow} options={options} />
      {permissions && options.length === 0 ? <Banner tone="warning">{t.noEligible}</Banner> : null}
    </ManagementDialog>
  );
}

function bindingDialogState(input: {
  flow: ReturnType<typeof useBindingEditor>;
  permissions: Permission[] | null;
  catalogReady: boolean;
  access: ReturnType<typeof useAccessControl>;
  source: EndpointReadSource;
}) {
  const { flow, access } = input;
  const options = eligiblePermissions(flow.current, input.permissions ?? []);
  const locked = flow.phase === 'unconfirmed' || flow.phase === 'reading';
  const pending = flow.phase === 'saving' || flow.phase === 'reading';
  const allowed =
    access.can(flow.current.binding ? 'endpoints.updateBinding' : 'endpoints.createBinding') &&
    access.can(input.source.operation);
  const dependency = !input.catalogReady || input.permissions === null;
  const disabled =
    !allowed ||
    dependency ||
    !flow.selected ||
    (flow.current.binding !== null && locked) ||
    flow.current.binding?.permissionId === flow.selected;
  return { options, locked, pending, disabled, dependency };
}

function BindingPermissionField({
  flow,
  options,
}: {
  flow: ReturnType<typeof useBindingEditor>;
  options: Permission[];
}) {
  const locale = useShell((state) => state.locale);
  const t = endpointMessages[locale];
  return (
    <Field id="binding-permission" name="permissionId" label={t.binding} required>
      <NativeSelect value={flow.selected} onChange={(event) => flow.select(event.target.value)}>
        <option value="">{t.choose}</option>
        {flow.selected && !options.some((permission) => permission.id === flow.selected) ? (
          <option value={flow.selected} disabled>
            {t.unavailable}: {flow.selected}
          </option>
        ) : null}
        {options.map((permission) => (
          <option key={permission.id} value={permission.id}>
            {permission.name} ({permission.code})
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}

function BindingCurrent({
  flow,
  onMatched,
}: {
  flow: ReturnType<typeof useBindingEditor>;
  onMatched: () => void;
}) {
  const locale = useShell((state) => state.locale);
  const t = endpointMessages[locale];
  const access = useAccessControl();
  if (flow.phase !== 'unconfirmed' && flow.phase !== 'reading') return null;
  const matched = flow.latest?.binding?.permissionId === flow.selected;
  return (
    <Banner tone="warning" className="space-y-3">
      <p>{t.conflict}</p>
      {flow.latest ? (
        <>
          <p>
            {t.current}:{' '}
            {flow.latest.binding
              ? `${flow.latest.binding.permissionId} · v${flow.latest.binding.version}`
              : t.unbound}
          </p>
          {matched ? (
            <>
              <p>{t.matched}</p>
              <Button
                variant="outline"
                onClick={() => {
                  access.refresh();
                  onMatched();
                }}
              >
                {t.confirmMatched}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={flow.adoptCurrent}>
              {t.adopt}
            </Button>
          )}
        </>
      ) : null}
    </Banner>
  );
}
