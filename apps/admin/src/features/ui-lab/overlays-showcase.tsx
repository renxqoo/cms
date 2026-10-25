'use client';

import { useRef, useState } from 'react';
import { InfoIcon, MoreHorizontalIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button, buttonStyles } from '@new-cms/ui/actions';
import { Checkbox, Field, Input } from '@new-cms/ui/forms';
import {
  ConfirmDialog,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Drawer,
  FormDialog,
  Menu,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
  Tooltip,
} from '@new-cms/ui/overlays';
import type { AsyncResult } from '@new-cms/ui/overlays';
import { AppLink } from '../../components/shell/navigation/app-link';
import { LabPage } from './lab-page';
import { LabOutput, LabSection } from './lab-section';

function FormExample() {
  const t = useTranslations('overlays');
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState(false);
  const [result, setResult] = useState('');
  function submit({ formData }: { signal: AbortSignal; formData: FormData }): Promise<AsyncResult> {
    if (failure) return Promise.resolve({ status: 'error', message: t('failureMessage') });
    const value = formData.get('title');
    setResult(typeof value === 'string' ? value : '');
    return Promise.resolve({ status: 'success' });
  }
  return (
    <LabSection title={t('dialogs')} description={t('dialogsDescription')}>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        trigger={<Button>{t('openForm')}</Button>}
        title={t('formTitle')}
        description={t('formDescription')}
        submitLabel={t('apply')}
        cancelLabel={t('cancel')}
        closeLabel={t('close')}
        errorLabel={t('error')}
        loadingSource="workbench-form"
        onSubmit={submit}
      >
        <Field id="overlay-example-title" name="title" label={t('title')}>
          <Input />
        </Field>
        <Checkbox label={t('failure')} checked={failure} onCheckedChange={setFailure} />
        <Dialog>
          <DialogTrigger render={<Button variant="outline">{t('nested')}</Button>} />
          <DialogContent closeLabel={t('close')}>
            <DialogTitle>{t('nestedTitle')}</DialogTitle>
            <DialogDescription>{t('nestedDescription')}</DialogDescription>
            <p>{t('nestedText')}</p>
            <DialogClose render={<Button variant="outline">{t('close')}</Button>} />
          </DialogContent>
        </Dialog>
      </FormDialog>
      <LabOutput label={t('localResult')} value={result} />
    </LabSection>
  );
}

function DrawerConfirmExample() {
  const t = useTranslations('overlays');
  const [drawer, setDrawer] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [failure, setFailure] = useState(false);
  const [count, setCount] = useState(0);
  function apply(): Promise<AsyncResult> {
    if (failure) return Promise.resolve({ status: 'error', message: t('failureMessage') });
    setCount((current) => current + 1);
    return Promise.resolve({ status: 'success' });
  }
  return (
    <>
      <LabSection title={t('drawers')}>
        <Drawer
          open={drawer}
          onOpenChange={setDrawer}
          title={t('drawerTitle')}
          description={t('drawerDescription')}
          closeLabel={t('close')}
          trigger={<Button variant="outline">{t('openDrawer')}</Button>}
        >
          <p className="text-sm text-muted-foreground">{t('drawerText')}</p>
          <Field id="drawer-example-title" label={t('title')}>
            <Input />
          </Field>
        </Drawer>
      </LabSection>
      <LabSection title={t('confirm')}>
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          trigger={<Button variant="destructive">{t('openConfirm')}</Button>}
          title={t('confirmTitle')}
          description={t('confirmDescription')}
          submitLabel={t('confirmAction')}
          cancelLabel={t('cancel')}
          closeLabel={t('close')}
          errorLabel={t('error')}
          tone="destructive"
          onConfirm={apply}
        >
          <Checkbox label={t('failure')} checked={failure} onCheckedChange={setFailure} />
        </ConfirmDialog>
        <p className="text-sm text-muted-foreground">{t('confirmed', { count })}</p>
      </LabSection>
    </>
  );
}

function PopupExample() {
  const t = useTranslations('overlays');
  const [details, setDetails] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [count, setCount] = useState(0);
  const [selected, setSelected] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  return (
    <LabSection title={t('popup')}>
      <div className="flex flex-wrap items-center gap-3">
        <Menu>
          <MenuTrigger
            render={
              <Button ref={menuTrigger} variant="outline" aria-label={t('openMenu')}>
                <MoreHorizontalIcon />
              </Button>
            }
          />
          <MenuContent>
            <MenuGroup>
              <MenuLabel>{t('menuGroup')}</MenuLabel>
              <MenuItem onClick={() => setDetails(true)}>{t('details')}</MenuItem>
              <MenuItem disabled>{t('unavailable')}</MenuItem>
            </MenuGroup>
            <MenuSeparator />
            <MenuItem tone="destructive" onClick={() => setConfirmation(true)}>
              {t('danger')}
            </MenuItem>
          </MenuContent>
        </Menu>
        <Popover>
          <PopoverTrigger render={<Button variant="outline">{t('popover')}</Button>} />
          <PopoverContent>
            <PopoverTitle className="font-medium">{t('popoverTitle')}</PopoverTitle>
            <PopoverDescription className="mt-1 text-muted-foreground">
              {t('popoverDescription')}
            </PopoverDescription>
            <div className="my-3">
              <Checkbox label={t('selected')} checked={selected} onCheckedChange={setSelected} />
            </div>
            <PopoverClose
              render={
                <Button variant="outline" size="sm">
                  {t('close')}
                </Button>
              }
            />
          </PopoverContent>
        </Popover>
        <Tooltip
          trigger={
            <Button variant="ghost" aria-label={t('tooltip')}>
              <InfoIcon />
            </Button>
          }
          delayMs={200}
        >
          {t('tooltipText')}
        </Tooltip>
      </div>
      <Dialog open={details} onOpenChange={setDetails}>
        <DialogContent closeLabel={t('close')} finalFocus={menuTrigger}>
          <DialogTitle>{t('drawerTitle')}</DialogTitle>
          <DialogDescription>{t('drawerText')}</DialogDescription>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmation}
        onOpenChange={setConfirmation}
        title={t('confirmTitle')}
        description={t('confirmDescription')}
        closeLabel={t('close')}
        cancelLabel={t('cancel')}
        submitLabel={t('confirmAction')}
        errorLabel={t('error')}
        tone="destructive"
        onConfirm={() => {
          setCount((value) => value + 1);
          return Promise.resolve({ status: 'success' });
        }}
      />
      <LabOutput label={t('confirm')} value={t('confirmed', { count })} />
      <AppLink href="/ui/data" prefetch={false} className={buttonStyles({ variant: 'link' })}>
        {t('sorting')}
      </AppLink>
    </LabSection>
  );
}

export function OverlaysShowcase() {
  return (
    <LabPage category="overlays">
      <FormExample />
      <DrawerConfirmExample />
      <PopupExample />
    </LabPage>
  );
}
