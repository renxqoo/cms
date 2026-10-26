'use client';
import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { NativeSelect } from '@new-cms/ui/forms';
import { Card, CardContent, CardHeader, CardTitle } from '@new-cms/ui/layout';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@new-cms/ui/overlays';
import { versionListSchema, versionDetailSchema, versionDiffSchema } from '../../contracts/content';
import type { Version, VersionDetail, VersionDiff } from '../../contracts/content';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { FieldRenderer } from '../fields/field-renderer';
import type { FieldServices } from '../fields/types';
import { collectionScope } from './content-policy';
import { documentDirty } from './channel-data';
import { useRevisionRefresh } from './use-revision-refresh';
import { bindingPreview, HistoricalFile } from './document-media';
import type { DocumentChannel, DocumentChannelState, ContentFailure } from './channel-types';
import type { ContentMessages } from './content-messages';
interface HistoryProps {
  channel: DocumentChannel;
  state: DocumentChannelState;
  services: FieldServices;
  messages: ContentMessages;
}
interface ReadView<T> {
  phase: string;
  data: T | null;
  error: ContentFailure | null;
  reload: () => void;
}
export function VersionHistory({ channel, state, services, messages: t }: HistoryProps) {
  const access = useAccessControl();
  const doc = state.snapshot.document;
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState('');
  const [from, setFrom] = useState('');
  const [confirm, setConfirm] = useState(false);
  const collection = state.snapshot.collection.key;
  const can = (operation: string) => access.can(operation, collectionScope(collection));
  const params = { collection, id: doc?.id ?? '' };
  const { locale } = state.snapshot.editor;
  const list = useApiQuery({
    operation: 'versions.list',
    params,
    query: { page, pageSize: 20, locale },
    response: versionListSchema,
    enabled: Boolean(doc) && can('versions.list'),
  });
  const detail = useApiQuery({
    operation: 'versions.get',
    params: { ...params, versionId: selected },
    query: { locale, fallback: [], depth: 0, mode: 'editing' },
    response: versionDetailSchema,
    enabled: Boolean(selected) && can('versions.get'),
  });
  const diff = useApiQuery({
    operation: 'versions.diff',
    params,
    query: { from, to: selected, locale },
    response: versionDiffSchema,
    enabled: [from, selected].every((value) => value.length > 0) && can('versions.diff'),
  });
  useRevisionRefresh(doc?.revision, list.reload);
  const restoreAllowed = canRestoreHistory({ state, selected, detail, can });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.versions}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ManagementFeedback error={list.error} onRetry={list.reload} />
        <div className="flex flex-wrap gap-2">
          <VersionSelect
            rows={list.data?.rows ?? []}
            value={selected}
            onChange={setSelected}
            label={t.version}
            empty={t.readVersion}
          />
          <Button
            variant="outline"
            disabled={page === 1 || list.phase === 'loading'}
            onClick={() => setPage((value) => value - 1)}
          >
            {t.previous}
          </Button>
          <Button
            variant="outline"
            disabled={!list.data || page * 20 >= list.data.total || list.phase === 'loading'}
            onClick={() => setPage((value) => value + 1)}
          >
            {t.next}
          </Button>
        </div>
        {selected ? (
          <>
            <VersionPreview
              detail={detail}
              state={state}
              services={services}
              selected={selected}
              messages={t}
            />
            <Button variant="outline" disabled={!restoreAllowed} onClick={() => setConfirm(true)}>
              {t.restoreVersion}
            </Button>
            <VersionSelect
              rows={list.data?.rows ?? []}
              value={from}
              onChange={setFrom}
              label={t.from}
              empty={t.from}
            />
            <VersionChanges result={diff} messages={t} />
          </>
        ) : null}
        <Dialog open={confirm} onOpenChange={setConfirm}>
          <DialogContent closeLabel={t.close}>
            <DialogHeader>
              <DialogTitle>{t.restoreVersion}</DialogTitle>
              <DialogDescription>{t.restoreVersionHint}</DialogDescription>
            </DialogHeader>
            <Banner>{t.allLocales}</Banner>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirm(false)}>
                {t.cancel}
              </Button>
              <Button
                disabled={!restoreAllowed}
                onClick={() => {
                  void channel.execute({ kind: 'restoreVersion', versionId: selected });
                  setConfirm(false);
                }}
              >
                {t.confirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
function VersionSelect({
  rows,
  value,
  onChange,
  label,
  empty,
}: {
  rows: readonly Version[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  empty: string;
}) {
  return (
    <NativeSelect
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{empty}</option>
      {rows.map((row) => (
        <option key={row.id} value={row.id}>
          {row.revision} · {row.kind} · {row.createdAt}
        </option>
      ))}
    </NativeSelect>
  );
}
function VersionPreview({
  detail,
  state,
  services,
  selected,
  messages: t,
}: {
  detail: ReadView<VersionDetail>;
  state: DocumentChannelState;
  services: FieldServices;
  selected: string;
  messages: ContentMessages;
}) {
  const { locale } = state.snapshot.editor;
  return (
    <div className="space-y-3">
      <ManagementFeedback error={detail.error} onRetry={detail.reload} />
      {detail.phase === 'ready' && detail.data ? (
        <>
          <p className="text-xs text-muted-foreground">
            {t.immutable} · {t.revision}: {detail.data.revision} · {t.actor}: {detail.data.actorId}
          </p>
          <HistoricalFile document={detail.data} label={t.preview} />
          <FieldRenderer
            idPrefix="history"
            layout={state.snapshot.editor.layout}
            value={detail.data.data}
            onChange={() => {}}
            onValidityChange={() => {}}
            resetKey={`${selected}:${locale}`}
            locale={locale}
            services={{ ...services, renderPreview: bindingPreview(detail.data) }}
            readOnly
            richTextNodes={state.snapshot.editor.richTextNodes}
          />
        </>
      ) : null}
    </div>
  );
}
function VersionChanges({
  result,
  messages: t,
}: {
  result: ReadView<VersionDiff>;
  messages: ContentMessages;
}) {
  return (
    <div className="space-y-3">
      <ManagementFeedback error={result.error} onRetry={result.reload} />
      {result.phase === 'ready'
        ? result.data?.changes.map((change) => (
            <div key={change.field} className="space-y-2 rounded-lg border p-3">
              <p className="font-medium">{change.field}</p>
              <div className="grid gap-3 md:grid-cols-2">
                <pre className="max-h-48 overflow-auto text-xs" aria-label={t.before} tabIndex={0}>
                  {JSON.stringify(change.before, null, 2)}
                </pre>
                <pre className="max-h-48 overflow-auto text-xs" aria-label={t.after} tabIndex={0}>
                  {JSON.stringify(change.after, null, 2)}
                </pre>
              </div>
            </div>
          ))
        : null}
    </div>
  );
}

function canRestoreHistory(input: {
  state: DocumentChannelState;
  selected: string;
  detail: ReadView<VersionDetail>;
  can: (operation: string) => boolean;
}) {
  const { state, selected, detail, can } = input;
  return (
    can('versions.restore') &&
    can('versions.get') &&
    detail.phase === 'ready' &&
    detail.data?.versionId === selected &&
    state.phase === 'idle' &&
    !documentDirty(state) &&
    Object.keys(state.invalid).length === 0
  );
}
