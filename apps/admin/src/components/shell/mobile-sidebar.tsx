'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@new-cms/ui/overlays';
import { appConfig } from '../../config/app';
import { ShellSidebar } from './shell-sidebar';
import { useShell } from './shell-provider';

export function MobileSidebar() {
  const t = useTranslations('shell');
  const open = useShell((state) => state.mobileOpen);
  const setOpen = useShell((state) => state.setMobileOpen);
  useEffect(() => {
    const query = window.matchMedia(appConfig.navigationBreakpoint);
    function closeOnDesktop() {
      if (query.matches) setOpen(false);
    }
    query.addEventListener('change', closeOnDesktop);
    return () => query.removeEventListener('change', closeOnDesktop);
  }, [setOpen]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        closeLabel={t('close')}
        className="top-0 left-0 h-svh w-72 max-w-[calc(100%-2rem)] translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-sidebar p-2 sm:max-w-72"
      >
        <DialogTitle className="sr-only">{t('navigation')}</DialogTitle>
        <DialogDescription className="sr-only">{t('navigationDescription')}</DialogDescription>
        <ShellSidebar mobile />
      </DialogContent>
    </Dialog>
  );
}
