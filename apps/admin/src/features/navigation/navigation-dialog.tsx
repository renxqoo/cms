'use client';

import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { useShell } from '../../components/shell/shell-provider';
import type { NavigationNode, Permission } from '../../contracts/access';
import { useAccessControl } from '../access-control/provider';
import { ManagementDialog } from '../management-shared/management-dialog';
import { ManagementFeedback } from '../management-shared/feedback';
import { navigationChanges, navigationValues } from './navigation-model';
import type { FlatNode } from './navigation-model';
import { NavigationFields } from './navigation-fields';
import { useNavigationEditor } from './use-navigation-editor';
import { navigationMessages } from './navigation-messages';

interface Props {
  node: NavigationNode | null;
  nodes: FlatNode[] | null;
  permissions: Permission[] | null;
  onClose: () => void;
  onSaved: () => void;
}

export function NavigationDialog(props: Props) {
  const flow = useNavigationEditor(props.node, props.onSaved);
  const access = useAccessControl();
  const locale = useShell((state) => state.locale);
  const t = navigationMessages[locale];
  const { locked, pending, disabled, dependency } = navigationDialogState(flow, props, access);
  return (
    <ManagementDialog
      open
      onClose={props.onClose}
      title={props.node ? t.edit : t.create}
      pending={pending}
      locked={locked}
      disabled={disabled}
      submitLabel={!props.node && locked ? t.retrySame : t.save}
      onSubmit={(form) => {
        const name = form.get('name');
        const draft = { ...flow.draft, name: typeof name === 'string' ? name : flow.draft.name };
        if (props.nodes)
          void flow.save({ draft, nodes: props.nodes, permissions: props.permissions });
      }}
      actions={
        props.node && locked ? (
          <Button
            variant="outline"
            disabled={pending || !access.can('navigation.list')}
            onClick={() => void flow.readCurrent()}
          >
            {t.readCurrent}
          </Button>
        ) : null
      }
      feedback={
        <>
          <ManagementFeedback error={flow.error} />
          {dependency ? <Banner tone="warning">{t.dependency}</Banner> : null}
          <NavigationCurrent flow={flow} />
        </>
      }
    >
      <NavigationFields
        value={flow.draft}
        onChange={flow.setDraft}
        nodes={props.nodes ?? []}
        permissions={props.permissions}
        currentId={flow.current?.id ?? null}
        creating={!props.node}
        locale={locale}
      />
    </ManagementDialog>
  );
}

function navigationDialogState(
  flow: ReturnType<typeof useNavigationEditor>,
  props: Props,
  access: ReturnType<typeof useAccessControl>,
) {
  const locked = flow.phase === 'unconfirmed' || flow.phase === 'reading';
  const pending = flow.phase === 'saving' || flow.phase === 'reading';
  const value = navigationValues(flow.draft, props.nodes ?? [], props.permissions);
  const noChanges =
    flow.current && value
      ? Object.keys(navigationChanges(flow.current, value)).length === 0
      : false;
  const dependency =
    props.nodes === null || (flow.draft.visibility === 'permission' && props.permissions === null);
  const allowed =
    access.can(props.node ? 'navigation.update' : 'navigation.create') &&
    access.can('navigation.list');
  const disabled =
    !allowed || dependency || value === null || noChanges || (flow.current !== null && locked);
  return { locked, pending, disabled, dependency };
}

function NavigationCurrent({ flow }: { flow: ReturnType<typeof useNavigationEditor> }) {
  const locale = useShell((state) => state.locale);
  const t = navigationMessages[locale];
  if (flow.phase !== 'unconfirmed' && flow.phase !== 'reading') return null;
  return (
    <Banner tone="warning" className="space-y-3">
      <p>{t.conflict}</p>
      {flow.latest ? (
        <>
          <p>
            {t.current}: {flow.latest.version}
          </p>
          <pre className="max-h-56 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
            {JSON.stringify(
              {
                name: flow.latest.name,
                type: flow.latest.type,
                parentId: flow.latest.parentId,
                path: flow.latest.path,
                icon: flow.latest.icon,
                sortOrder: flow.latest.sortOrder,
                status: flow.latest.status,
                visibility: flow.latest.visibility,
                permissionId: flow.latest.permissionId,
              },
              null,
              2,
            )}
          </pre>
          <Button variant="outline" onClick={flow.adoptCurrent}>
            {t.adopt}
          </Button>
        </>
      ) : null}
    </Banner>
  );
}
