import { Button } from '@new-cms/ui/actions';
import type { Binding, Endpoint } from '../../contracts/access';
import { endpointKey } from './endpoint-model';
import { bindingTarget } from './recovery-read';
import type { BindingTarget } from './binding-read';
import { recoveryMessages } from './recovery-messages';

export function createRecoveryBindingColumns({
  endpoints,
  ready,
  canDelete,
  locale,
  remove,
}: {
  endpoints: Endpoint[] | null;
  ready: boolean;
  canDelete: boolean;
  locale: 'zh' | 'en';
  remove: (value: BindingTarget) => void;
}) {
  const t = recoveryMessages[locale];
  return [
    { key: 'operation', header: t.operation, cell: (row: Binding) => row.operationId },
    { key: 'scope', header: t.scope, cell: (row: Binding) => row.collectionKey ?? t.global },
    { key: 'id', header: t.id, cell: (row: Binding) => row.id },
    { key: 'permission', header: t.permission, cell: (row: Binding) => row.permissionId },
    { key: 'version', header: t.version, cell: (row: Binding) => row.version },
    {
      key: 'state',
      header: t.state,
      cell: (row: Binding) =>
        endpoints?.some((endpoint) => endpointKey(endpoint) === endpointKey(row))
          ? t.current
          : t.orphan,
    },
    {
      key: 'actions',
      header: t.remove,
      cell: (row: Binding) => (
        <Button
          variant="ghost"
          disabled={!ready || !canDelete}
          onClick={() => remove(bindingTarget(row))}
        >
          {t.remove}
        </Button>
      ),
    },
  ];
}
