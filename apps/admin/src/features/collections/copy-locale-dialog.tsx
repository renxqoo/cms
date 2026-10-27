'use client';

import { useState } from 'react';
import { LanguagesIcon } from 'lucide-react';
import { Banner } from '@new-cms/ui/feedback';
import { Button } from '@new-cms/ui/actions';
import { Field, Input, NativeSelect } from '@new-cms/ui/forms';
import { MenuItem } from '@new-cms/ui/overlays';
import { useShell } from '../../components/shell/shell-provider';
import { documentSchema } from '../../contracts/documents';
import type { EditorSnapshot } from './editor-read';
import { ManagementDialog } from '../management-shared/management-dialog';
import { ManagementFeedback } from '../management-shared/feedback';
import { useContentMutation } from './use-content-mutation';

const labels = {
  en: {
    title: 'Copy to another language',
    from: 'Source language',
    to: 'Target language',
    mode: 'Copy mode',
    empty: 'Fill empty fields',
    overwrite: 'Overwrite translated fields',
    description: 'Save translated fields from this saved revision into another language.',
    retry: 'Verify the same copy request',
    refresh: 'Refresh current document',
    changed: 'The saved document changed. Refresh before copying.',
  },
  zh: {
    title: '复制到其他语言',
    from: '源语言',
    to: '目标语言',
    mode: '复制方式',
    empty: '仅填充空字段',
    overwrite: '覆盖已有翻译',
    description: '将当前已保存修订的本地化字段保存到另一语言。',
    retry: '核实同一次复制请求',
    refresh: '刷新当前文档',
    changed: '已保存文档已变化，请刷新后重新复制。',
  },
};
export function CopyLocaleMenuItem(props: { disabled: boolean; onClick: () => void }) {
  const locale = useShell((state) => state.locale);
  return (
    <MenuItem {...props}>
      <LanguagesIcon aria-hidden="true" />
      {labels[locale].title}
    </MenuItem>
  );
}
export function CopyLocaleDialog(props: {
  snapshot: EditorSnapshot;
  editorSessionId: string;
  onClose: () => void;
  onRefresh: () => void;
  onCopied: (locale: string, id: string) => void;
}) {
  const language = useShell((state) => state.locale);
  const t = labels[language];
  const [source] = useState(props.snapshot);
  const targets = source.editor.locales.supported.filter(
    (locale) => locale !== source.editor.locale,
  );
  const [target, setTarget] = useState(targets[0] ?? '');
  const [overwrite, setOverwrite] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const mutation = useContentMutation();
  const { document } = source;
  const current = matchingSource(source, props.snapshot);
  const valid = document !== null && current && targets.includes(target);
  function submit() {
    if (mutation.replayable) {
      mutation.retry();
      return;
    }
    if (!valid || !document || mutation.locked) return;
    void mutation.run(
      {
        operation: 'documents.copyLocale',
        params: { collection: source.collection.key, id: document.id },
        body: {
          revision: document.revision,
          fromLocale: source.editor.locale,
          toLocale: target,
          overwrite,
        },
        editorSessionId: props.editorSessionId,
        response: documentSchema,
        idempotencyKey: key,
      },
      () => props.onCopied(target, document.id),
    );
  }
  return (
    <ManagementDialog
      open
      title={t.title}
      description={t.description}
      onClose={props.onClose}
      onSubmit={submit}
      submitLabel={mutation.replayable ? t.retry : t.title}
      pending={mutation.pending}
      locked={mutation.locked}
      disabled={!valid || (mutation.locked && !mutation.replayable)}
      feedback={
        <>
          {!current ? <Banner tone="warning">{t.changed}</Banner> : null}
          <ManagementFeedback
            error={mutation.error}
            {...(mutation.replayable ? { onRetry: mutation.retry } : {})}
          />
        </>
      }
      actions={
        (mutation.locked && !mutation.replayable) || !current ? (
          <Button onClick={props.onRefresh}>{t.refresh}</Button>
        ) : undefined
      }
    >
      <Field id="locale-copy-from" label={t.from}>
        <Input value={source.editor.locale} readOnly />
      </Field>
      <Field id="locale-copy-to" label={t.to}>
        <NativeSelect value={target} onChange={(event) => setTarget(event.currentTarget.value)}>
          {targets.map((locale) => (
            <option key={locale} value={locale}>
              {locale}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="locale-copy-mode" label={t.mode}>
        <NativeSelect
          value={overwrite ? 'overwrite' : 'empty'}
          onChange={(event) => setOverwrite(event.currentTarget.value === 'overwrite')}
        >
          <option value="empty">{t.empty}</option>
          <option value="overwrite">{t.overwrite}</option>
        </NativeSelect>
      </Field>
    </ManagementDialog>
  );
}

function matchingSource(source: EditorSnapshot, current: EditorSnapshot) {
  return (
    source.document?.versionId === current.document?.versionId &&
    source.editor.behaviorHash === current.editor.behaviorHash
  );
}
