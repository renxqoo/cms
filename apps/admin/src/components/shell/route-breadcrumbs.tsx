'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { StepNavigation, StepNavigationProvider } from '@new-cms/ui/navigation';
import { appConfig } from '../../config/app';
import { componentRoutes, isComponentRouteId } from '../../config/navigation';
import { AppLink } from './navigation/app-link';

export function RouteBreadcrumbs() {
  const pathname = usePathname();
  const t = useTranslations('shell');
  const categoryCopy = useTranslations('catalog');
  const category = Object.keys(componentRoutes)
    .filter(isComponentRouteId)
    .find((id) => componentRoutes[id].href === pathname);
  const current = category
    ? { id: category, label: categoryCopy(`${category}Title`) }
    : pathname === '/ui/lists'
      ? { id: 'lists', label: t('lists') }
      : null;
  const items = [
    { id: 'workbench', label: appConfig.name, href: '/ui' },
    ...(current ? [current] : []),
  ];
  return (
    <StepNavigationProvider
      label={t('breadcrumbs')}
      fallback={<span className="text-sm font-medium">{appConfig.name}</span>}
      renderLink={(item) => (
        <AppLink
          href={item.href ?? '/ui'}
          prefetch={false}
          className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {item.label}
        </AppLink>
      )}
    >
      <StepNavigation items={items} />
    </StepNavigationProvider>
  );
}
