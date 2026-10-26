import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { SingletonLookup } from './singleton-lookup';
import { useAccessControl } from '../access-control/provider';
import { collectionScope } from './content-policy';
import { channelReadable } from './channel-policy';
import { ManagementFeedback } from '../management-shared/feedback';
import type { DocumentChannel, DocumentChannelState } from './channel-types';
import type { ContentMessages } from './content-messages';
export function DocumentFeedback({
  channel,
  state,
  messages: t,
  readReady,
}: {
  channel: DocumentChannel;
  state: DocumentChannelState;
  messages: ContentMessages;
  readReady: boolean;
}) {
  const access = useAccessControl();
  const scope = collectionScope(state.snapshot.collection.key);
  const pending = state.pending?.source === 'document' ? state.pending : null;
  const retryAllowed =
    readReady &&
    pending !== null &&
    access.can(pending.operation, scope) &&
    channelReadable((operation) => access.can(operation, scope));
  const conflict =
    state.phase === 'blocked' || (state.phase === 'checking' && state.error !== null);
  return (
    <div className="space-y-3">
      <ManagementFeedback error={state.error} />
      {!state.snapshot.document && state.snapshot.collection.singleton ? (
        <SingletonLookup
          collection={state.snapshot.collection.key}
          locale={state.snapshot.editor.locale}
          messages={t}
        />
      ) : null}
      <ManagementFeedback error={state.inspectionError} />
      {state.success ? <Banner tone="success">{t.saved}</Banner> : null}
      {Object.keys(state.invalid).length > 0 ? <Banner tone="error">{t.invalid}</Banner> : null}
      {conflict ? (
        <Banner tone="warning" className="space-y-3">
          <p>{t.conflict}</p>
          <ConflictActions
            state={state}
            channel={channel}
            messages={t}
            readReady={readReady}
            retryAllowed={retryAllowed}
          />
          <DraftComparison state={state} channel={channel} messages={t} />
        </Banner>
      ) : null}
    </div>
  );
}

function DraftComparison({
  state,
  channel,
  messages: t,
}: {
  state: DocumentChannelState;
  channel: DocumentChannel;
  messages: ContentMessages;
}) {
  return state.remote ? (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <p>{t.currentData}</p>
          <pre className="max-h-56 overflow-auto rounded-lg bg-muted p-3 text-xs" tabIndex={0}>
            {JSON.stringify(state.remote.document?.data, null, 2)}
          </pre>
        </div>
        <div>
          <p>{t.draftData}</p>
          <pre className="max-h-56 overflow-auto rounded-lg bg-muted p-3 text-xs" tabIndex={0}>
            {JSON.stringify(state.draft, null, 2)}
          </pre>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => channel.rebase(false)}>
          {t.rebase}
        </Button>
        <Button variant="outline" onClick={() => channel.rebase(true)}>
          {t.discard}
        </Button>
      </div>
    </div>
  ) : null;
}

function ConflictActions({
  state,
  channel,
  messages: t,
  readReady,
  retryAllowed,
}: {
  state: DocumentChannelState;
  channel: DocumentChannel;
  messages: ContentMessages;
  readReady: boolean;
  retryAllowed: boolean;
}) {
  const pending = state.pending?.source === 'document' ? state.pending : null;
  return (
    <>
      {' '}
      {state.snapshot.document && state.pending?.source !== 'asset' ? (
        <Button
          variant="outline"
          busy={state.phase === 'checking'}
          disabled={!readReady}
          onClick={() => void channel.inspect()}
        >
          {t.inspect}
        </Button>
      ) : (
        <p>{t.verifyCreate}</p>
      )}
      {pending?.retryable ? (
        <Button
          variant="outline"
          disabled={!retryAllowed || state.phase === 'checking'}
          onClick={() => void channel.retry()}
        >
          {t.retryIntent}
        </Button>
      ) : null}
    </>
  );
}
