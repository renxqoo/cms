'use client';

import { useId, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Button } from '@new-cms/ui/actions';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@new-cms/ui/overlays';
import { UnsavedChangesGuard } from '../../components/cms/unsaved-changes';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useShell } from '../../components/shell/shell-provider';

export interface ManagementDialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  feedback?: ReactNode;
  onSubmit: (formData: FormData) => void;
  submitLabel?: string;
  disabled?: boolean;
  pending?: boolean;
  locked?: boolean;
  destructive?: boolean;
  actions?: ReactNode;
  dirty?: boolean;
}

export function ManagementDialog({
  open,
  onClose,
  title,
  description,
  children,
  feedback,
  onSubmit,
  submitLabel,
  disabled = false,
  pending = false,
  locked = false,
  destructive = false,
  actions,
  dirty,
}: ManagementDialogProps) {
  const id = useId();
  const changes = useDialogChanges(dirty);
  const { adapter } = useAppNavigation();
  const locale = useShell((state) => state.locale);
  const close = locale === 'zh' ? '关闭' : 'Close';
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || disabled) return;
    changes.markChanged();
    onSubmit(new FormData(event.currentTarget));
  }
  return (
    <UnsavedChangesGuard
      dirty={changes.dirty || pending || locked}
      navigation={adapter}
      labels={leaveLabels(locale, close)}
    >
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !locked && !pending) onClose();
        }}
      >
        <DialogContent
          closeLabel={close}
          showCloseButton={!locked && !pending}
          className="sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {feedback}
          <form
            onChange={changes.markChanged}
            id={id}
            onSubmit={submit}
            className="space-y-4"
            aria-busy={pending}
          >
            <fieldset disabled={pending || locked} className="space-y-4">
              {children}
            </fieldset>
          </form>
          <DialogFooter>
            {actions}
            <Button variant="outline" disabled={locked || pending} onClick={onClose}>
              {close}
            </Button>
            <Button
              type="submit"
              form={id}
              variant={destructive ? 'destructive' : 'default'}
              disabled={disabled}
              busy={pending}
            >
              {submitLabel ?? (locale === 'zh' ? '保存' : 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </UnsavedChangesGuard>
  );
}

function useDialogChanges(controlled: boolean | undefined) {
  const [changed, setChanged] = useState(false);
  return {
    dirty: controlled ?? changed,
    markChanged(this: void) {
      if (controlled === undefined) setChanged(true);
    },
  };
}

function leaveLabels(locale: 'zh' | 'en', close: string) {
  if (locale === 'zh')
    return {
      title: '\u79bb\u5f00\u672a\u4fdd\u5b58\u7684\u7f16\u8f91\uff1f',
      description:
        '\u8349\u7a3f\u6216\u672a\u786e\u8ba4\u7684\u64cd\u4f5c\u7ed3\u679c\u4f1a\u4e22\u5931\u3002',
      confirm: '\u79bb\u5f00',
      cancel: '\u7ee7\u7eed\u7f16\u8f91',
      close,
    };
  return {
    title: 'Leave unsaved changes?',
    description: 'Drafts or an unconfirmed operation result will be lost.',
    confirm: 'Leave',
    cancel: 'Keep editing',
    close,
  };
}
