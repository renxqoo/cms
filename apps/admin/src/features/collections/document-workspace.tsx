'use client';
import type { ReactNode } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { Field, NativeSelect } from '@new-cms/ui/forms';
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from '@new-cms/ui/layout';
import { AppLink } from '../../components/shell/navigation/app-link';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { documentSchema } from '../../contracts/content';
import { useAccessControl } from '../access-control/provider';
import { FieldRenderer } from '../fields/field-renderer';
import type { FieldServices } from '../fields/types';
import { collectionPath, documentPath, collectionScope } from './content-policy';
import { canEditDraft } from './channel-policy';
import { documentTitle } from './document-label';
import { DocumentActionBar } from './document-action-bar';
import { DocumentFeedback } from './document-feedback';
import { VersionHistory } from './version-history';
import { PublicationSchedules } from './publication-schedules';
import { DocumentMedia } from './document-media';
import { FolderManager } from './folder-manager';
import type { DocumentChannel, DocumentChannelState } from './channel-types';
import type { ContentMessages } from './content-messages';
export interface WorkspaceProps {
  channel: DocumentChannel;
  state: DocumentChannelState;
  services: FieldServices;
  readReady: boolean;
  messages: ContentMessages;
  referenceFeedback: ReactNode;
}
export function DocumentWorkspace(props: WorkspaceProps) {
  const { channel, state, services, readReady, messages: t } = props;
  const { collection, editor, document } = state.snapshot;
  return (
    <div className="space-y-5">
      <PageHeader
        title={document ? documentTitle(document, collection) : `${t.create} · ${collection.label}`}
        description={t.conditional}
        actions={
          <>
            <Button
              variant="outline"
              busy={state.phase === 'checking'}
              disabled={!readReady || state.phase === 'writing'}
              onClick={() => void channel.inspect()}
            >
              {t.refresh}
            </Button>
            <AppLink href={collectionPath(collection.key)}>{t.back}</AppLink>
          </>
        }
      />
      <DocumentLocaleBar {...props} />
      <DocumentActionBar channel={channel} state={state} readReady={readReady} messages={t} />
      <DocumentFeedback channel={channel} state={state} messages={t} readReady={readReady} />
      <DocumentReceipts state={state} messages={t} />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(260px,1fr)]">
        <DocumentFields {...props} />
        <div className="space-y-5">
          <DocumentMedia channel={channel} state={state} readReady={readReady} messages={t} />
          <Card>
            <CardHeader>
              <CardTitle>{t.folders}</CardTitle>
            </CardHeader>
            <CardContent>
              <FolderManager
                collection={collection.key}
                channel={channel}
                state={state}
                messages={t}
              />
            </CardContent>
          </Card>
          {document && collection.capabilities.schedules ? (
            <PublicationSchedules channel={channel} state={state} messages={t} />
          ) : null}
        </div>
      </div>
      {document && collection.capabilities.history ? (
        <VersionHistory channel={channel} state={state} services={services} messages={t} />
      ) : null}
      <AppLink href={`${collectionPath(collection.key)}/structure`}>{t.structure}</AppLink>
      <p className="sr-only">{editor.locale}</p>
    </div>
  );
}
function documentReadOnly(props: WorkspaceProps, can: (operation: string) => boolean) {
  const { state, readReady } = props;
  const doc = state.snapshot.document;
  return (
    !readReady ||
    !can(doc ? 'documents.update' : 'documents.create') ||
    state.snapshot.editor.intent === 'read' ||
    !canEditDraft(state)
  );
}
function DocumentFields(props: WorkspaceProps) {
  const { channel, state, services, messages: t, referenceFeedback } = props;
  const access = useAccessControl();
  const { collection, editor, document } = state.snapshot;
  const readonly = documentReadOnly(props, (operation) =>
    access.can(operation, collectionScope(collection.key)),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.fieldData}</CardTitle>
      </CardHeader>
      <CardContent>
        {referenceFeedback}
        {readonly ? <Banner>{t.readonly}</Banner> : null}
        <FieldRenderer
          idPrefix={`document:${collection.key}`}
          layout={editor.layout}
          value={state.draft}
          onChange={channel.edit}
          onValidityChange={channel.validity}
          resetKey={`${document?.id ?? 'new'}:${editor.locale}:${state.reset}`}
          locale={editor.locale}
          services={services}
          readOnly={readonly}
          enforceRequired={collection.mode === 'direct'}
          errors={Object.fromEntries(
            (state.error?.error.fieldErrors ?? []).map((error) => [error.field, t.invalidField]),
          )}
          richTextNodes={editor.richTextNodes}
        />
      </CardContent>
    </Card>
  );
}
function DocumentLocaleBar({ state, messages: t }: WorkspaceProps) {
  const navigation = useAppNavigation();
  const { collection, editor, document } = state.snapshot;
  function change(locale: string) {
    navigation.push(
      documentPath(collection.key, document?.id ?? 'new', locale) +
        (!document && state.snapshot.upload ? `&uploadId=${state.snapshot.upload.id}` : ''),
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-5">
      <Field id="content-locale" label={t.locale}>
        <NativeSelect
          value={editor.locale}
          disabled={state.phase === 'writing'}
          onChange={(event) => change(event.target.value)}
        >
          {editor.locales.supported.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {document ? (
        <p className="text-xs break-all text-muted-foreground">
          {t.revision}: {document.revision} · {t.published}: {document.publishedVersionId ?? '—'} ·{' '}
          {document.id}
        </p>
      ) : null}
    </div>
  );
}
function DocumentReceipts({
  state,
  messages: t,
}: {
  state: DocumentChannelState;
  messages: ContentMessages;
}) {
  const { collection, editor, document } = state.snapshot;
  const copied = documentSchema.safeParse(state.receipt);
  const copiedId = copied.success && copied.data.id !== document?.id ? copied.data.id : null;
  return (
    <>
      {copiedId ? (
        <Banner tone="success">
          <AppLink href={documentPath(collection.key, copiedId, editor.locale)}>
            {t.copy} · {copiedId}
          </AppLink>
        </Banner>
      ) : null}
      {state.snapshot.upload ? <Banner>{t.uploadReady}</Banner> : null}
      {!document && collection.upload && !state.snapshot.upload ? (
        <Banner>
          <p>{t.uploadRequired}</p>
          <AppLink href={`/dashboard/resources?collection=${encodeURIComponent(collection.key)}`}>
            {t.resources}
          </AppLink>
        </Banner>
      ) : null}
    </>
  );
}
