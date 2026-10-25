import {
  BellIcon,
  BlocksIcon,
  FilesIcon,
  LayoutDashboardIcon,
  LayoutPanelTopIcon,
  MousePointer2Icon,
  PanelTopIcon,
  Table2Icon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const componentRoutes = {
  actions: { href: '/ui/actions', icon: MousePointer2Icon },
  inputs: { href: '/ui/inputs', icon: BlocksIcon },
  layout: { href: '/ui/layout', icon: LayoutPanelTopIcon },
  feedback: { href: '/ui/feedback', icon: BellIcon },
  data: { href: '/ui/data', icon: Table2Icon },
  overlays: { href: '/ui/overlays', icon: PanelTopIcon },
  documents: { href: '/ui/documents', icon: FilesIcon },
} as const;

export type ComponentRouteId = keyof typeof componentRoutes;

export function isComponentRouteId(value: string): value is ComponentRouteId {
  return Object.hasOwn(componentRoutes, value);
}

export interface NavigationItem {
  href: string;
  label: ComponentRouteId | 'overview' | 'lists';
  icon: LucideIcon;
}

export interface NavigationGroup {
  id: string;
  label: 'overviewGroup' | 'componentsGroup' | 'patternsGroup';
  items: readonly NavigationItem[];
}

export const navigationGroups: readonly NavigationGroup[] = [
  {
    id: 'workbench',
    label: 'overviewGroup',
    items: [{ href: '/ui', label: 'overview', icon: LayoutDashboardIcon }],
  },
  {
    id: 'components',
    label: 'componentsGroup',
    items: Object.keys(componentRoutes)
      .filter(isComponentRouteId)
      .map((label) => ({ ...componentRoutes[label], label })),
  },
  {
    id: 'patterns',
    label: 'patternsGroup',
    items: [{ href: '/ui/lists', label: 'lists', icon: Table2Icon }],
  },
];
