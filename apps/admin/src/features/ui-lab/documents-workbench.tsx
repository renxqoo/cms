'use client';

import { useAppNavigation } from '../../components/shell/navigation/provider';
import { CmsShowcase } from './cms-showcase';

export function DocumentsWorkbench() {
  const { adapter, push } = useAppNavigation();
  return <CmsShowcase navigation={adapter} onNavigate={push} />;
}
