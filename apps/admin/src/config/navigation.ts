import { LayoutDashboardIcon, Table2Icon } from 'lucide-react';

export const navigationGroups = [
  {
    id: 'workbench',
    label: 'overviewGroup',
    items: [{ href: '/ui', label: 'overview', icon: LayoutDashboardIcon }],
  },
  {
    id: 'patterns',
    label: 'patternsGroup',
    items: [{ href: '/ui/lists', label: 'lists', icon: Table2Icon }],
  },
] as const;
