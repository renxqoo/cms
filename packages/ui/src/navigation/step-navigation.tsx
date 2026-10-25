'use client';

import { createContext, useContext, useEffect, useEffectEvent, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { Breadcrumbs } from './controls.tsx';
import type { BreadcrumbItem } from './controls.tsx';

export interface StepNavigationItem {
  id: string;
  label: string;
  href?: string;
}

interface NavigationEntry {
  owner: symbol;
  items: readonly StepNavigationItem[];
}

const NavigationContext = createContext<Dispatch<
  SetStateAction<readonly NavigationEntry[]>
> | null>(null);

export function StepNavigationProvider({
  label,
  children,
  renderLink,
  fallback,
}: {
  label: string;
  children: ReactNode;
  fallback?: ReactNode;
  renderLink?: (item: BreadcrumbItem) => ReactNode;
}) {
  const [entries, setEntries] = useState<readonly NavigationEntry[]>([]);
  const current = entries.at(-1);
  return (
    <NavigationContext.Provider value={setEntries}>
      {current ? (
        <Breadcrumbs label={label} items={current.items} renderLink={renderLink} />
      ) : (
        fallback
      )}
      {children}
    </NavigationContext.Provider>
  );
}

export function StepNavigation({ items }: { items: readonly StepNavigationItem[] }) {
  const setEntries = useContext(NavigationContext);
  if (!setEntries) throw new Error('StepNavigationProvider is required');
  const key = JSON.stringify(items);
  const readItems = useEffectEvent(() => items);
  useEffect(() => {
    const owner = Symbol(key);
    const currentItems = readItems();
    setEntries((current) => [...current, { owner, items: currentItems }]);
    return () => setEntries((current) => current.filter((entry) => entry.owner !== owner));
  }, [key, setEntries]);
  return null;
}
