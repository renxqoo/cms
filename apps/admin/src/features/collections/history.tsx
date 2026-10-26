'use client';

import { useState } from 'react';
import { ArrowLeftIcon, HistoryIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Field, NativeSelect } from '@new-cms/ui/forms';
import { Pagination } from '@new-cms/ui/data';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@new-cms/ui/overlays';
import {
  versionPageSchema,
  versionDetailSchema,
  versionDiffSchema,
} from '../../contracts/documents';
import type { Document, ContentVersion } from '../../contracts/documents';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import type { ContentMessages } from './messages';
import { contentEditorPolicy } from './policy';
import { FixedMedia } from '../assets/document-media';
import { PrivateFile } from '../assets/private-file';

interface HistoryProps {
  document: Document;
  locale: string;
  t: ContentMessages;
  busy: boolean;
  dirty: boolean;
  onRestore: (versionId: string) => void;
}

export function DocumentHistory(props: HistoryProps) {
  const [open, setOpen] = useState(false);
  const access = useAccessControl();
  if (
    !access.can('versions.list', {
      scopeKind: 'collection',
      collectionKey: props.document.collection,
    })
  )
    return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <HistoryIcon aria-hidden="true" />
        {props.t.versions}
      </DialogTrigger>
      {open ? (
        <DialogContent
          closeLabel={props.t.close}
          className="max-h-[calc(100dvh-2rem)] sm:max-w-4xl"
        >
          <HistoryPanel key={props.document.revision} {...props} onClose={() => setOpen(false)} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

type HistoryView = { kind: 'list' } | { kind: 'preview' | 'restore'; version: ContentVersion };

function HistoryPanel(props: HistoryProps & { onClose: () => void }) {
  const { document, locale, t, busy, dirty } = props;
  const access = useAccessControl();
  const scope = { scopeKind: 'collection', collectionKey: document.collection } as const;
  const [page, setPage] = useState(1);
  const [view, setView] = useState<HistoryView>({ kind: 'list' });
  const versions = useApiQuery({
    operation: 'versions.list',
    params: { collection: document.collection, id: document.id },
    query: { locale, page, pageSize: contentEditorPolicy.versionPageSize },
    response: versionPageSchema,
    enabled: access.can('versions.list', scope),
  });
  if (!access.can('versions.list', scope)) return null;
  if (view.kind !== 'list')
    return <HistoryDetail {...props} view={view} onBack={() => setView({ kind: 'list' })} />;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t.versions}</DialogTitle>
      </DialogHeader>
      <div className="min-w-0 space-y-4">
        <ManagementFeedback error={versions.error} onRetry={versions.reload} />
        {versions.phase === 'loading' ? <p role="status">{t.loading}</p> : null}
        {dirty ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t.saveFirst}
          </p>
        ) : null}
        {versions.data?.rows.length === 0 ? <p>{t.noVersions}</p> : null}
        <div className="space-y-2">
          {versions.data?.rows.map((version) => (
            <div
              key={version.id}
              className="flex min-w-0 flex-wrap items-center gap-3 border-b border-border py-3"
            >
              <span className="min-w-0 flex-1 basis-full break-words sm:basis-auto">
                {t.revision} {version.revision} · {version.kind} ·{' '}
                <time dateTime={version.createdAt}>{version.createdAt}</time>
              </span>
              {access.can('versions.get', scope) ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setView({ kind: 'preview', version })}
                >
                  {t.preview}
                </Button>
              ) : null}
              {access.can('versions.restore', scope) ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || dirty}
                  onClick={() => setView({ kind: 'restore', version })}
                >
                  {t.restoreVersion}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
        {versions.data ? (
          <Pagination
            page={page}
            pageSize={contentEditorPolicy.versionPageSize}
            total={versions.data.total}
            onPageChange={setPage}
            previousLabel="←"
            nextLabel="→"
            pageLabel={`${page}`}
            totalLabel={`${versions.data.total}`}
          />
        ) : null}
        {access.can('versions.diff', scope) ? (
          <VersionComparison
            document={document}
            locale={locale}
            versions={versions.data?.rows ?? []}
            t={t}
          />
        ) : null}
      </div>
    </>
  );
}

function HistoryDetail({
  view,
  onBack,
  ...props
}: HistoryProps & {
  view: Exclude<HistoryView, { kind: 'list' }>;
  onBack: () => void;
  onClose: () => void;
}) {
  const { document, locale, t, busy, dirty, onRestore, onClose } = props;
  const access = useAccessControl();
  const scope = { scopeKind: 'collection', collectionKey: document.collection } as const;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{view.kind === 'preview' ? t.version : t.restoreVersion}</DialogTitle>
        {view.kind === 'restore' ? <DialogDescription>{t.restoreWarning}</DialogDescription> : null}
      </DialogHeader>
      <Button autoFocus variant="ghost" className="w-fit" onClick={onBack}>
        <ArrowLeftIcon aria-hidden="true" />
        {t.backToVersions}
      </Button>
      {view.kind === 'preview' ? (
        access.can('versions.get', scope) ? (
          <VersionPreview document={document} locale={locale} versionId={view.version.id} t={t} />
        ) : (
          <p role="alert">{t.denied}</p>
        )
      ) : (
        <>
          <p>
            {t.revision} {view.version.revision}
          </p>
          {dirty ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t.saveFirst}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={onBack}>
              {t.cancel}
            </Button>
            <Button
              disabled={dirty || busy || !access.can('versions.restore', scope)}
              onClick={() => {
                onRestore(view.version.id);
                onClose();
              }}
            >
              {t.confirm}
            </Button>
          </DialogFooter>
        </>
      )}
    </>
  );
}

function VersionComparison({
  document,
  locale,
  versions,
  t,
}: {
  document: Document;
  locale: string;
  versions: readonly ContentVersion[];
  t: ContentMessages;
}) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [comparison, setComparison] = useState<{ from: string; to: string } | null>(null);
  const diff = useApiQuery({
    operation: 'versions.diff',
    params: { collection: document.collection, id: document.id },
    query: { from: comparison?.from, to: comparison?.to, locale },
    response: versionDiffSchema,
    enabled: comparison !== null,
  });
  return (
    <>
      <div className="grid min-w-0 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <VersionSelect
          id="history-from"
          label={t.from}
          value={from}
          onChange={setFrom}
          versions={versions}
        />
        <VersionSelect
          id="history-to"
          label={t.to}
          value={to}
          onChange={setTo}
          versions={versions}
        />
        <Button
          variant="outline"
          disabled={!from || !to || from === to}
          onClick={() => setComparison({ from, to })}
        >
          {t.compare}
        </Button>
      </div>
      <ManagementFeedback error={diff.error} onRetry={diff.reload} />
      {diff.data && comparison ? (
        <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs">
          {JSON.stringify(diff.data.changes, null, 2)}
        </pre>
      ) : null}
    </>
  );
}

function VersionSelect({
  id,
  label,
  value,
  onChange,
  versions,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  versions: readonly ContentVersion[];
}) {
  return (
    <Field id={id} label={label} className="min-w-0">
      <NativeSelect
        className="w-full max-w-full"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="">—</option>
        {value && !versions.some((version) => version.id === value) ? (
          <option value={value}>{value}</option>
        ) : null}
        {versions.map((version) => (
          <option key={version.id} value={version.id}>
            {version.revision} · {version.id}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}

function VersionPreview({
  document,
  locale,
  versionId,
  t,
}: {
  document: Document;
  locale: string;
  versionId: string;
  t: ContentMessages;
}) {
  const detail = useApiQuery({
    operation: 'versions.get',
    params: { collection: document.collection, id: document.id, versionId },
    query: { locale, fallback: [], depth: 0, mode: 'editing' },
    response: versionDetailSchema,
  });
  return (
    <div className="min-w-0 space-y-4">
      <ManagementFeedback error={detail.error} onRetry={detail.reload} />
      {detail.data ? (
        <div className="min-w-0 space-y-4">
          <pre className="overflow-auto whitespace-pre-wrap break-all text-xs">
            {JSON.stringify(detail.data.data, null, 2)}
          </pre>
          {detail.data.file ? (
            <PrivateFile
              target={{
                collection: detail.data.collection,
                id: detail.data.id,
                versionId: detail.data.versionId,
                mode: 'editing',
              }}
              manifest={detail.data.file}
            />
          ) : null}
          <FixedMedia document={detail.data} />
        </div>
      ) : detail.phase === 'loading' ? (
        <p role="status">{t.loading}</p>
      ) : null}
    </div>
  );
}
