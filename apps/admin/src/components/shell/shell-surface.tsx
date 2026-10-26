'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface ShellGroup {
  id: string;
  label: string;
  feedback?: ReactNode;
  items: readonly { href: string; label: string; icon: LucideIcon; disabled?: boolean }[];
}

export interface ShellSurface {
  homeHref: string;
  activeHref?: string;
  subtitle: string;
  groups: readonly ShellGroup[];
  footer: ReactNode;
  account: ReactNode;
  breadcrumbs: readonly { id: string; label: string; href?: string }[];
}

const SurfaceContext = createContext<ShellSurface | null>(null);
export const ShellSurfaceProvider = SurfaceContext.Provider;

export function useShellSurface() {
  return useContext(SurfaceContext);
}
