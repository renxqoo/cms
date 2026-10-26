import { Banner } from '@new-cms/ui/feedback';
import { Field, Input, NativeSelect } from '@new-cms/ui/forms';
import type { Permission } from '../../contracts/access';
import { adminIcons, adminRoutes } from '../../config/admin-routes';
import type { FlatNode, NavigationDraft } from './navigation-model';
import { changeNodeType } from './navigation-model';
import { navigationMessages } from './navigation-messages';

interface FieldsProps {
  value: NavigationDraft;
  onChange: (value: NavigationDraft) => void;
  nodes: FlatNode[];
  permissions: Permission[] | null;
  currentId: string | null;
  creating: boolean;
  locale: 'zh' | 'en';
}

export function NavigationFields(props: FieldsProps) {
  const { value, onChange } = props;
  const t = navigationMessages[props.locale];
  const hasChildren =
    props.currentId !== null && props.nodes.some(({ node }) => node.parentId === props.currentId);
  return (
    <>
      <Field id="node-name" name="name" label={t.name} required>
        <Input
          value={value.name}
          maxLength={128}
          autoComplete="off"
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
      </Field>
      <Field
        id="node-type"
        name="type"
        label={t.type}
        description={hasChildren ? t.childrenHint : undefined}
      >
        <NativeSelect
          value={value.type}
          disabled={hasChildren}
          onChange={(event) =>
            onChange(
              changeNodeType(
                value,
                event.target.value === 'page' || event.target.value === 'action'
                  ? event.target.value
                  : 'group',
              ),
            )
          }
        >
          <option value="group">{t.group}</option>
          <option value="page">{t.page}</option>
          <option value="action">{t.action}</option>
        </NativeSelect>
      </Field>
      <NavigationTarget {...props} />
      {value.type !== 'group' ? <NavigationVisibility {...props} /> : null}
      <Field id="node-sort" name="sortOrder" label={t.sortOrder} description={t.orderHint}>
        <Input
          type="number"
          min={-2147483648}
          max={2147483647}
          step={1}
          value={value.sortOrder}
          onChange={(event) => onChange({ ...value, sortOrder: event.target.value })}
        />
      </Field>
      {!props.creating ? (
        <Field id="node-status" name="status" label={t.status}>
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
            <option value="disabled">{t.disabled}</option>
          </NativeSelect>
        </Field>
      ) : null}
      {value.type === 'action' ? <Banner>{t.actionHint}</Banner> : null}
    </>
  );
}

function NavigationTarget({ value, onChange, nodes, currentId, locale }: FieldsProps) {
  const t = navigationMessages[locale];
  const parentType = value.type === 'page' ? 'group' : 'page';
  const parents = nodes.filter(({ node }) => node.type === parentType && node.id !== currentId);
  return (
    <>
      {value.type !== 'group' ? (
        <Field id="node-parent" name="parentId" label={t.parent} required>
          <NativeSelect
            value={value.parentId}
            onChange={(event) => onChange({ ...value, parentId: event.target.value })}
          >
            <option value="">{t.choose}</option>
            {parents.map(({ node }) => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
      {value.type === 'page' ? (
        <Field id="node-path" name="path" label={t.path} required>
          <NativeSelect
            value={value.path}
            onChange={(event) => onChange({ ...value, path: event.target.value })}
          >
            <option value="">{t.choose}</option>
            {value.path && !adminRoutes.some((route) => route.path === value.path) ? (
              <option value={value.path}>
                {t.unregistered}: {value.path}
              </option>
            ) : null}
            {adminRoutes.map((route) => (
              <option key={route.id} value={route.path}>
                {route.label[locale]} ({route.path})
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
      {value.type !== 'action' ? (
        <Field id="node-icon" name="icon" label={t.icon}>
          <NativeSelect
            value={value.icon}
            onChange={(event) => onChange({ ...value, icon: event.target.value })}
          >
            <option value="">{t.noIcon}</option>
            {Object.keys(adminIcons).map((icon) => (
              <option key={icon} value={icon}>
                {icon}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
    </>
  );
}

function NavigationVisibility({ value, onChange, permissions, locale }: FieldsProps) {
  const t = navigationMessages[locale];
  return (
    <>
      <Field id="node-visibility" name="visibility" label={t.visibility}>
        <NativeSelect
          value={value.visibility}
          onChange={(event) =>
            onChange({
              ...value,
              visibility: event.target.value === 'permission' ? 'permission' : 'authenticated',
              permissionId: '',
            })
          }
        >
          <option value="authenticated">{t.authenticated}</option>
          <option value="permission">{t.permission}</option>
        </NativeSelect>
      </Field>
      {value.visibility === 'permission' ? (
        <Field id="node-permission" name="permissionId" label={t.permissionId} required>
          <NativeSelect
            value={value.permissionId}
            disabled={permissions === null}
            onChange={(event) => onChange({ ...value, permissionId: event.target.value })}
          >
            <option value="">{t.choose}</option>
            {permissions?.map((permission) => (
              <option
                key={permission.id}
                value={permission.id}
                disabled={permission.status !== 'active'}
              >
                {permission.name} ({permission.code})
                {permission.status === 'disabled' ? ` · ${t.disabled}` : ''}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
    </>
  );
}
