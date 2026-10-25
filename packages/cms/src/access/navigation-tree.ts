import type { NavigationNode, NavigationTree, VisibleNavigation } from './types.ts';

function sorted(nodes: NavigationNode[]) {
  return nodes.toSorted(
    (left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
  );
}

export function fullNavigationTree(
  nodes: NavigationNode[],
  parentId: string | null = null,
): NavigationTree[] {
  return sorted(nodes.filter((node) => node.parentId === parentId)).map((node) => ({
    ...node,
    children: fullNavigationTree(nodes, node.id),
  }));
}

export function visibleNavigationTree(
  nodes: NavigationNode[],
  visible: ReadonlySet<string>,
  parentId: string | null = null,
): VisibleNavigation[] {
  const tree: VisibleNavigation[] = [];
  for (const node of sorted(nodes.filter((item) => item.parentId === parentId))) {
    if (node.status !== 'active' || !visible.has(node.id)) continue;
    const children = visibleNavigationTree(nodes, visible, node.id);
    if (node.type === 'group' && children.length === 0) continue;
    tree.push({
      id: node.id,
      type: node.type,
      name: node.name,
      path: node.path,
      icon: node.icon,
      children,
    });
  }
  return tree;
}
