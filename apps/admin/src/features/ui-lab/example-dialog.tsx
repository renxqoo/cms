'use client';

import { useTranslations } from 'next-intl';
import { Field, Input, NativeSelect } from '@new-cms/ui/forms';
import { FormDialog } from '@new-cms/ui/overlays';
import type { AsyncResult } from '@new-cms/ui/overlays';
import type { ExampleDocument } from './list-data';
import { useShell } from '../../components/shell/shell-provider';

export function ExampleDialog({
  open,
  onOpenChange,
  editing,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ExampleDocument | undefined;
  onApply: (document: ExampleDocument) => void;
}) {
  const t = useTranslations('lists');
  const locale = useShell((state) => state.locale);

  function submit({ formData }: { signal: AbortSignal; formData: FormData }): Promise<AsyncResult> {
    const rawTitle = formData.get('title');
    const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
    if (!title)
      return Promise.resolve({
        status: 'error',
        message: t('error'),
        fieldErrors: { title: t('titleRequired') },
      });
    const rawCategory = formData.get('category');
    const category = typeof rawCategory === 'string' ? rawCategory.trim() : '';
    const status = formData.get('status') === 'published' ? 'published' : 'draft';
    onApply({
      id: editing?.id ?? crypto.randomUUID(),
      title: { zh: title, en: title },
      category: { zh: category, en: category },
      status,
      updatedAt: new Date().toISOString(),
    });
    return Promise.resolve({ status: 'success' });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(editing ? 'editDialogTitle' : 'dialogTitle')}
      description={t('dialogDescription')}
      closeLabel={t('close')}
      cancelLabel={t('cancel')}
      submitLabel={t('save')}
      errorLabel={t('error')}
      onSubmit={submit}
    >
      <Field id="example-title" name="title" label={t('titleLabel')} required>
        <Input defaultValue={editing?.title[locale] ?? ''} placeholder={t('titlePlaceholder')} />
      </Field>
      <Field id="example-category" name="category" label={t('categoryLabel')}>
        <Input
          defaultValue={editing?.category[locale] ?? ''}
          placeholder={t('categoryPlaceholder')}
        />
      </Field>
      <Field id="example-status" name="status" label={t('status')}>
        <NativeSelect defaultValue={editing?.status ?? 'draft'}>
          <option value="draft">{t('draft')}</option>
          <option value="published">{t('published')}</option>
        </NativeSelect>
      </Field>
    </FormDialog>
  );
}
