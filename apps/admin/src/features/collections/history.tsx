'use client';

import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Field, NativeSelect } from '@new-cms/ui/forms';
import { Card, CardContent, CardHeader, CardTitle } from '@new-cms/ui/layout';
import { Pagination } from '@new-cms/ui/data';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@new-cms/ui/overlays';
import {
  versionPageSchema,
  versionDetailSchema,
  versionDiffSchema,
} from '../../contracts/documents';
import type { Document, ContentVersion } from '../../contracts/documents';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementDialog } from '../management-shared/management-dialog';
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
  const { document, locale, t, busy, dirty, onRestore } = props;
  const access = useAccessControl();
  const scope = { scopeKind: 'collection', collectionKey: document.collection } as const;
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const versions = useApiQuery({
    operation: 'versions.list',
    params: { collection: document.collection, id: document.id },
    query: { locale, page, pageSize: contentEditorPolicy.versionPageSize },
    response: versionPageSchema,
    enabled: access.can('versions.list', scope),
  });
  if (!access.can('versions.list', scope)) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.versions}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ManagementFeedback error={versions.error} onRetry={versions.reload} />
        {versions.data?.rows.length === 0 ? <p>{t.noVersions}</p> : null}
        <div className="space-y-2">
          {versions.data?.rows.map((version) => (
            <div
              key={version.id}
              className="flex flex-wrap items-center gap-3 border-b border-border py-3"
            >
              <span className="min-w-0 flex-1 break-words">
                {t.revision} {version.revision} · {version.kind} ·{' '}
                <time dateTime={version.createdAt}>{version.createdAt}</time>
              </span>
              {access.can('versions.get', scope) ? (
                <Button size="sm" variant="outline" onClick={() => setSelected(version.id)}>
                  {t.preview}
                </Button>
              ) : null}
              {access.can('versions.restore', scope) ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || dirty}
                  onClick={() => setRestoring(version.id)}
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
      </CardContent>
      {selected ? (
        <VersionPreview
          document={document}
          locale={locale}
          versionId={selected}
          t={t}
          onClose={() => setSelected(null)}
        />
      ) : null}
      {restoring ? (
        <ManagementDialog
          open
          onClose={() => setRestoring(null)}
          title={t.restoreVersion}
          description={t.restoreWarning}
          pending={busy}
          disabled={dirty || busy}
          submitLabel={t.confirm}
          onSubmit={() => {
            onRestore(restoring);
            setRestoring(null);
          }}
        >
          <p className="break-all">{restoring}</p>
        </ManagementDialog>
      ) : null}
    </Card>
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
      <div className="flex flex-wrap items-end gap-3">
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
          disabled={!from || !to}
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
    <Field id={id} label={label} className="w-full min-w-0 sm:w-auto">
      <NativeSelect
        className="max-w-full"
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
  onClose,
}: {
  document: Document;
  locale: string;
  versionId: string;
  t: ContentMessages;
  onClose: () => void;
}) {
  const detail = useApiQuery({
    operation: 'versions.get',
    params: { collection: document.collection, id: document.id, versionId },
    query: { locale, fallback: [], depth: 0, mode: 'editing' },
    response: versionDetailSchema,
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent closeLabel={t.close} className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t.version}</DialogTitle>
        </DialogHeader>
        <ManagementFeedback error={detail.error} onRetry={detail.reload} />
        {detail.data ? (
          <div className="max-h-[70vh] space-y-4 overflow-auto">
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
        ) : (
          <p role="status">{t.loading}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
