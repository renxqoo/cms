import { z } from 'zod';
import type { NavigationNode, NavigationTree, Permission } from '../../contracts/access';
import { adminIcons, adminRoutes } from '../../config/admin-routes';

export interface FlatNode {
  node: NavigationTree;
  depth: number;
  ancestorDisabled: boolean;
}
export interface NavigationDraft {
  parentId: string;
  type: 'group' | 'page' | 'action';
  name: string;
  path: string;
  icon: string;
  sortOrder: string;
  status: 'active' | 'disabled';
  visibility: 'container' | 'authenticated' | 'permission';
  permissionId: string;
}

export function flattenNavigation(
  rows: readonly NavigationTree[],
  context = { depth: 0, disabled: false },
): FlatNode[] {
  return rows.flatMap((node) => [
    { node, depth: context.depth, ancestorDisabled: context.disabled },
    ...flattenNavigation(node.children, {
      depth: context.depth + 1,
      disabled: context.disabled || node.status === 'disabled',
    }),
  ]);
}

export function navigationDraft(node: NavigationNode | null): NavigationDraft {
  if (!node)
    return {
      parentId: '',
      type: 'group',
      name: '',
      path: '',
      icon: '',
      sortOrder: '0',
      status: 'active',
      visibility: 'container',
      permissionId: '',
    };
  return {
    parentId: node.parentId ?? '',
    type: node.type,
    name: node.name,
    path: node.path ?? '',
    icon: node.icon ?? '',
    sortOrder: String(node.sortOrder),
    status: node.status,
    visibility: node.visibility,
    permissionId: node.permissionId ?? '',
  };
}

export function changeNodeType(
  draft: NavigationDraft,
  type: NavigationDraft['type'],
): NavigationDraft {
  return {
    ...draft,
    type,
    parentId: '',
    path: '',
    icon: '',
    visibility: type === 'group' ? 'container' : 'authenticated',
    permissionId: '',
  };
}

const draftSchema = z.object({
  name: z.string().trim().min(1).max(128),
  type: z.enum(['group', 'page', 'action']),
  parentId: z.uuid().nullable(),
  path: z.string().nullable(),
  icon: z.string().nullable(),
  sortOrder: z.number().int().min(-2147483648).max(2147483647),
  status: z.enum(['active', 'disabled']),
  visibility: z.enum(['container', 'authenticated', 'permission']),
  permissionId: z.uuid().nullable(),
});

export function navigationValues(
  draft: NavigationDraft,
  nodes: readonly FlatNode[],
  permissions: readonly Permission[] | null,
) {
  const parsed = draftSchema.safeParse({
    ...draft,
    parentId: draft.parentId || null,
    path: draft.path || null,
    icon: draft.icon || null,
    sortOrder: Number(draft.sortOrder),
    permissionId: draft.permissionId || null,
  });
  if (!parsed.success) return null;
  const value = parsed.data;
  return validShape(value, nodes, permissions) ? value : null;
}

function validShape(
  value: z.infer<typeof draftSchema>,
  nodes: readonly FlatNode[],
  permissions: readonly Permission[] | null,
): boolean {
  if (value.type === 'group') return validGroup(value);
  const parentType = value.type === 'page' ? 'group' : 'page';
  if (!nodes.some(({ node }) => node.id === value.parentId && node.type === parentType))
    return false;
  if (
    value.visibility === 'container' ||
    (value.visibility === 'permission') !== (value.permissionId !== null)
  )
    return false;
  if (
    value.permissionId !== null &&
    !permissions?.some(
      (permission) => permission.id === value.permissionId && permission.status === 'active',
    )
  )
    return false;
  return validNodeTarget(value);
}

function validGroup(value: z.infer<typeof draftSchema>): boolean {
  return (
    value.parentId === null &&
    value.path === null &&
    value.visibility === 'container' &&
    value.permissionId === null &&
    validIcon(value.icon)
  );
}

function validIcon(icon: string | null): boolean {
  return icon === null || Object.hasOwn(adminIcons, icon);
}
function validNodeTarget(node: z.infer<typeof draftSchema>): boolean {
  if (node.type === 'action') return node.path === null && node.icon === null;
  return adminRoutes.some((route) => route.path === node.path) && validIcon(node.icon);
}

const editableFields = [
  'parentId',
  'type',
  'name',
  'path',
  'icon',
  'sortOrder',
  'status',
  'visibility',
  'permissionId',
] as const;

export function navigationChanges(before: NavigationNode, after: z.infer<typeof draftSchema>) {
  return Object.fromEntries(
    editableFields.filter((key) => before[key] !== after[key]).map((key) => [key, after[key]]),
  );
}
