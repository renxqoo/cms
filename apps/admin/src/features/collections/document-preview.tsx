'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ExternalLink, Monitor, X } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Field, NativeSelect } from '@new-cms/ui/forms';
import { useShell } from '../../components/shell/shell-provider';
import { documentPreviewSchema } from '../../contracts/collaboration';
import type { DocumentPreview } from '../../contracts/collaboration';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import type { ContentEditorModel } from './use-content-editor';
import { collaborationMessages } from './collaboration-messages';
import { usePreviewBridge } from './use-preview-bridge';

export function DocumentPreviewPanel({
  model,
  children,
}: {
  model: ContentEditorModel;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [adminOrigin, setAdminOrigin] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const language = useShell((state) => state.locale);
  const t = collaborationMessages[language];
  const access = useAccessControl();
  const { snapshot } = model.state;
  const enabled =
    snapshot?.editor.preview === true &&
    snapshot.document !== null &&
    access.can('documents.preview', {
      scopeKind: 'collection',
      collectionKey: model.props.collectionKey,
    });
  useEffect(() => {
    if (!open) return () => {};
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);
  function toggle() {
    setAdminOrigin(window.location.origin);
    setOpen(!open);
  }
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  if (!enabled || !snapshot?.document) return <>{children}</>;
  return (
    <>
      <Button
        ref={trigger}
        variant="outline"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <Monitor aria-hidden="true" />
        {t.preview}
      </Button>
      <div
        className={
          open ? 'grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : 'min-w-0'
        }
      >
        <div className="min-w-0 space-y-6">{children}</div>
        {open ? (
          <aside
            id={panelId}
            aria-label={t.preview}
            className="min-w-0 space-y-4 rounded-xl border bg-card p-4 xl:sticky xl:top-4 xl:self-start"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-medium">{t.preview}</h2>
              <Button variant="ghost" size="icon" aria-label={t.close} onClick={close}>
                <X aria-hidden="true" />
              </Button>
            </div>
            <PreviewContent
              key={`${snapshot.document.id}:${snapshot.editor.locale}`}
              adminOrigin={adminOrigin}
              model={model}
            />
          </aside>
        ) : null}
      </div>
    </>
  );
}
function PreviewContent({
  model,
  adminOrigin,
}: {
  model: ContentEditorModel;
  adminOrigin: string | null;
}) {
  const language = useShell((state) => state.locale);
  const t = collaborationMessages[language];
  const { snapshot } = model.state;
  const query = useApiQuery({
    operation: 'documents.preview',
    params: { collection: model.props.collectionKey, id: snapshot?.document?.id ?? '' },
    query: { locale: snapshot?.editor.locale },
    response: documentPreviewSchema,
    enabled: snapshot?.document !== null,
  });
  return (
    <div className="min-w-0 space-y-3">
      <ManagementFeedback error={query.error} onRetry={query.reload} />
      {query.data && snapshot?.document ? (
        <PreviewFrame
          adminOrigin={adminOrigin}
          key={query.data.url}
          configuration={query.data}
          model={model}
        />
      ) : !query.error ? (
        <p role="status">{t.loading}</p>
      ) : null}
    </div>
  );
}
function PreviewFrame({
  configuration,
  model,
  adminOrigin,
}: {
  configuration: DocumentPreview;
  model: ContentEditorModel;
  adminOrigin: string | null;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [deviceIndex, setDeviceIndex] = useState(0);
  const language = useShell((state) => state.locale);
  const t = collaborationMessages[language];
  const device = configuration.devices[deviceIndex] ?? configuration.devices[0];
  const bridge = usePreviewBridge({ configuration, model, frame, adminOrigin });
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field id="preview-device" label={t.device}>
          <NativeSelect
            value={deviceIndex}
            onChange={(event) => setDeviceIndex(Number(event.currentTarget.value))}
          >
            {configuration.devices.map((entry, index) => (
              <option key={entry.name} value={index}>
                {entry.name} · {entry.width} × {entry.height}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <a
          href={configuration.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm underline underline-offset-4 focus-visible:outline-2"
        >
          <ExternalLink aria-hidden="true" className="size-4" />
          {t.external}
        </a>
      </div>
      {configuration.live ? (
        <p role="status" className="text-sm text-muted-foreground">
          {bridge.ready ? t.connected : t.waiting}
        </p>
      ) : null}
      <ManagementFeedback error={bridge.failure} />
      <div className="max-h-[70vh] max-w-full overflow-auto rounded-md border bg-muted p-2">
        {bridge.sandbox ? (
          <iframe
            ref={frame}
            src={configuration.url}
            title={configuration.live ? t.live : t.preview}
            onLoad={bridge.connect}
            sandbox={bridge.sandbox}
            referrerPolicy="no-referrer"
            className="mx-auto max-w-none border-0 bg-background"
            style={{ width: device?.width, height: device?.height }}
          />
        ) : (
          <p className="p-4 text-sm text-muted-foreground">{t.separateOrigin}</p>
        )}
      </div>
    </>
  );
}
