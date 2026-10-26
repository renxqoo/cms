import { MoreHorizontalIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Pill } from '@new-cms/ui/feedback';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@new-cms/ui/overlays';
import type { Endpoint, Permission } from '../../contracts/access';
import type { endpointMessages } from './endpoint-messages';

type Labels = { [Key in keyof typeof endpointMessages.en]: string };
interface Options {
  t: Labels;
  permissions: Permission[] | null;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  catalogReady: boolean;
  edit: (endpoint: Endpoint) => void;
  remove: (endpoint: Endpoint) => void;
}

export function createEndpointColumns(options: Options) {
  const { t } = options;
  return [
    {
      key: 'operation',
      header: t.operation,
      cell: (endpoint: Endpoint) => (
        <span className="font-mono text-xs">{endpoint.operationId}</span>
      ),
    },
    {
      key: 'method',
      header: t.method,
      cell: (endpoint: Endpoint) => <Pill>{endpoint.method}</Pill>,
    },
    {
      key: 'path',
      header: t.path,
      cell: (endpoint: Endpoint) => <span className="font-mono text-xs">{endpoint.path}</span>,
    },
    { key: 'module', header: t.module, cell: (endpoint: Endpoint) => endpoint.module },
    {
      key: 'access',
      header: t.access,
      cell: (endpoint: Endpoint) => <Pill>{t[endpoint.accessKind]}</Pill>,
    },
    {
      key: 'scope',
      header: t.scope,
      cell: (endpoint: Endpoint) => endpoint.collectionKey ?? t.global,
    },
    {
      key: 'binding',
      header: t.binding,
      cell: (endpoint: Endpoint) =>
        endpoint.binding
          ? (options.permissions?.find(
              (permission) => permission.id === endpoint.binding?.permissionId,
            )?.name ?? endpoint.binding.permissionId)
          : t.unbound,
    },
    {
      key: 'actions',
      header: t.actions,
      cell: (endpoint: Endpoint) => <EndpointActions endpoint={endpoint} options={options} />,
    },
  ];
}

function EndpointActions({ endpoint, options }: { endpoint: Endpoint; options: Options }) {
  const { t } = options;
  if (!endpoint.bindingConfigurable) return <span>—</span>;
  const canEdit = endpoint.binding ? options.canUpdate : options.canCreate;
  const canDelete = endpoint.binding !== null && options.canDelete;
  if (!canEdit && !canDelete) return <span>—</span>;
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${t.actions}: ${endpoint.operationId} ${endpoint.collectionKey ?? t.global}`}
          />
        }
      >
        <MoreHorizontalIcon />
      </MenuTrigger>
      <MenuContent>
        {canEdit ? (
          <MenuItem disabled={!options.catalogReady} onClick={() => options.edit(endpoint)}>
            {t.configure}
          </MenuItem>
        ) : null}
        {canDelete ? (
          <MenuItem
            disabled={!options.catalogReady}
            tone="destructive"
            onClick={() => options.remove(endpoint)}
          >
            {t.remove}
          </MenuItem>
        ) : null}
      </MenuContent>
    </Menu>
  );
}
