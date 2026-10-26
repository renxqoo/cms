'use client';

import { AppLink } from './navigation/app-link';
import { usePathname } from 'next/navigation';
import { ChevronDownIcon, ChevronRightIcon, ShieldCheckIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@new-cms/ui/actions';
import { appConfig } from '../../config/app';
import { navigationGroups, isComponentRouteId } from '../../config/navigation';
import { useShellSurface } from './shell-surface';
import { useShell } from './shell-provider';

export function ShellSidebar({
  collapsed = false,
  mobile = false,
}: {
  collapsed?: boolean;
  mobile?: boolean;
}) {
  const t = useTranslations('shell');
  const categoryCopy = useTranslations('catalog');
  function itemLabel(label: string) {
    return isComponentRouteId(label) ? categoryCopy(`${label}Title`) : t(label);
  }
  const surface = useShellSurface();
  const groups =
    surface?.groups ??
    navigationGroups.map((group) => ({
      ...group,
      label: t(group.label),
      items: group.items.map((item) => ({
        ...item,
        disabled: false,
        label: itemLabel(item.label),
      })),
    }));
  const pathname = usePathname();
  const collapsedGroups = useShell((state) => state.collapsedGroups);
  const toggleGroup = useShell((state) => state.toggleGroup);
  const closeMobile = useShell((state) => state.setMobileOpen);
  const containerClass = mobile
    ? 'flex h-full w-full flex-col'
    : `fixed inset-y-0 left-0 z-10 flex h-svh flex-col p-2 ${collapsed ? 'w-[66px]' : 'w-72'}`;
  return (
    <aside className={containerClass} aria-label={t('navigation')}>
      <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
        <AppLink
          href={surface?.homeHref ?? '/ui'}
          prefetch={false}
          onClick={() => closeMobile(false)}
          aria-label={appConfig.name}
          className="flex h-10 shrink-0 items-center gap-2 overflow-hidden rounded-lg p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheckIcon className="size-4" aria-hidden="true" />
          </span>
          {!collapsed && (
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="text-sm font-semibold">{appConfig.name}</span>
              <span className="text-[10px] text-muted-foreground">
                {surface?.subtitle ?? t('subtitle')}
              </span>
            </span>
          )}
        </AppLink>
        <nav className="min-h-0 flex-1 overflow-y-auto py-2">
          {groups.map((group, index) => {
            const groupOpen = !collapsedGroups.includes(group.id);
            const groupLabel = group.label;
            return (
              <section
                key={group.id}
                className={
                  index > 0 && !collapsed ? 'mt-2 border-t border-sidebar-border pt-2' : undefined
                }
              >
                {!collapsed && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-full justify-between px-2 text-xs text-muted-foreground"
                    aria-expanded={groupOpen}
                    aria-label={t(groupOpen ? 'collapseGroup' : 'expandGroup', {
                      group: groupLabel,
                    })}
                    onClick={() => toggleGroup(group.id)}
                  >
                    {groupLabel}
                    {groupOpen ? (
                      <ChevronDownIcon className="size-3" />
                    ) : (
                      <ChevronRightIcon className="size-3" />
                    )}
                  </Button>
                )}
                {(collapsed || groupOpen) && (
                  <ul className="space-y-1 px-1">
                    {group.items.map((item) => {
                      const active = (surface?.activeHref ?? pathname) === item.href;
                      const Icon = item.icon;
                      return (
                        <li key={item.href}>
                          {item.disabled ? (
                            <span
                              role="link"
                              aria-disabled="true"
                              aria-label={item.label}
                              title={item.label}
                              className="flex h-8 items-center gap-2 overflow-hidden rounded-md px-2 text-sm text-muted-foreground opacity-60"
                            >
                              <Icon className="size-4 shrink-0" aria-hidden="true" />
                              {!collapsed && <span className="truncate">{item.label}</span>}
                            </span>
                          ) : (
                            <AppLink
                              href={item.href}
                              prefetch={false}
                              onClick={() => closeMobile(false)}
                              title={collapsed ? item.label : undefined}
                              aria-current={active ? 'page' : undefined}
                              aria-label={collapsed ? item.label : undefined}
                              className={`flex h-8 items-center gap-2 overflow-hidden rounded-md px-2 text-sm outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring ${active ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : ''}`}
                            >
                              <Icon className="size-4 shrink-0" aria-hidden="true" />
                              {!collapsed && <span className="truncate">{item.label}</span>}
                            </AppLink>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </nav>
        {surface ? (
          surface.footer
        ) : (
          <div className="flex shrink-0 items-center gap-2 overflow-hidden rounded-lg p-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-medium ring-1 ring-border">
              OA
            </span>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{t('workbench')}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {t('workbenchDescription')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
