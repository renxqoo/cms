import { MoreHorizontalIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Pill } from '@new-cms/ui/feedback';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@new-cms/ui/overlays';
import type { NavigationNode } from '../../contracts/access';
import { matchAdminRoute } from '../../config/admin-routes';
import type { FlatNode } from './navigation-model';
import type { navigationMessages } from './navigation-messages';

type Labels = { [Key in keyof typeof navigationMessages.en]: string };

export function createNavigationColumns({
  t,
  canUpdate,
  canDelete,
  edit,
  remove,
}: {
  t: Labels;
  canUpdate: boolean;
  canDelete: boolean;
  edit: (node: NavigationNode) => void;
  remove: (node: NavigationNode) => void;
}) {
  return [
    {
      key: 'name',
      header: t.name,
      cell: ({ node, depth }: FlatNode) => (
        <span className={`font-medium ${depth === 0 ? 'pl-0' : depth === 1 ? 'pl-5' : 'pl-10'}`}>
          {node.name}
        </span>
      ),
    },
    { key: 'type', header: t.type, cell: ({ node }: FlatNode) => <Pill>{t[node.type]}</Pill> },
    {
      key: 'path',
      header: t.path,
      cell: ({ node }: FlatNode) => (
        <span className="font-mono text-xs">
          {node.path ?? '—'}
          {node.path && !matchAdminRoute(node.path) ? (
            <span className="ml-2 text-destructive">{t.unregistered}</span>
          ) : null}
        </span>
      ),
    },
    { key: 'sortOrder', header: t.sortOrder, cell: ({ node }: FlatNode) => node.sortOrder },
    {
      key: 'status',
      header: t.status,
      cell: ({ node, ancestorDisabled }: FlatNode) => (
        <div className="flex gap-1">
          <Pill tone={node.status === 'active' ? 'success' : 'warning'}>{t[node.status]}</Pill>
          {ancestorDisabled ? <Pill tone="warning">{t.ancestorDisabled}</Pill> : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: t.actions,
      cell: ({ node }: FlatNode) =>
        canUpdate || canDelete ? (
          <Menu>
            <MenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label={`${t.actions}: ${node.name}`} />
              }
            >
              <MoreHorizontalIcon />
            </MenuTrigger>
            <MenuContent>
              {canUpdate ? <MenuItem onClick={() => edit(node)}>{t.edit}</MenuItem> : null}
              {canDelete ? (
                <MenuItem
                  tone="destructive"
                  disabled={node.children.length > 0}
                  onClick={() => remove(node)}
                >
                  {t.remove}
                </MenuItem>
              ) : null}
            </MenuContent>
          </Menu>
        ) : (
          <span>—</span>
        ),
    },
  ];
}
