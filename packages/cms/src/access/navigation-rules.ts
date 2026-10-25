import { fail } from '@new-cms/cms/platform/contracts';
import type { SqlExecutor } from '@new-cms/database/client';
import { findResource } from './adapters/postgres/resource-store.ts';
import type { AccessRuntime, NavigationNode } from './types.ts';

type NodeShape = Omit<NavigationNode, 'id' | 'version' | 'createdAt' | 'updatedAt'>;

function validateShape(node: NodeShape) {
  if (node.type === 'group') {
    if (
      node.parentId !== null ||
      node.path !== null ||
      node.permissionId !== null ||
      node.visibility !== 'container'
    )
      fail('invalid_input');
  } else {
    if (node.parentId === null || node.visibility === 'container') fail('invalid_input');
    if (node.type === 'page' && node.path === null) fail('invalid_input');
    if (node.type === 'action' && (node.path !== null || node.icon !== null)) fail('invalid_input');
  }
  if ((node.visibility === 'permission') !== (node.permissionId !== null)) fail('invalid_input');
}

function validateFamily(input: { node: NodeShape; nodes: NavigationNode[]; id?: string }) {
  const { node, nodes } = input;
  if (node.parentId !== null) {
    const parent = nodes.find((item) => item.id === node.parentId);
    const expected = node.type === 'page' ? 'group' : 'page';
    if (!parent || parent.type !== expected || parent.id === input.id) fail('invalid_input');
  }
  const childType = node.type === 'group' ? 'page' : 'action';
  if (
    nodes.some(
      (item) => item.parentId === input.id && (node.type === 'action' || item.type !== childType),
    )
  )
    fail('resource_in_use');
}

export async function validateNavigation(
  runtime: AccessRuntime,
  input: { node: NodeShape; nodes: NavigationNode[]; tx: SqlExecutor; id?: string },
) {
  validateShape(input.node);
  validateFamily(input);
  if (input.node.path !== null && !runtime.navigationPaths.includes(input.node.path))
    fail('invalid_input');
  if (input.node.icon !== null && !runtime.navigationIcons.includes(input.node.icon))
    fail('invalid_input');
  if (input.node.permissionId !== null) {
    const permission = await findResource(input.tx, {
      table: 'permissions',
      id: input.node.permissionId,
    });
    if (permission?.status !== 'active') fail('invalid_input');
  }
}
