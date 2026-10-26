'use client';

import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { ManagementFeedback } from '../management-shared/feedback';
import type { ContentEditorModel } from './use-content-editor';
import { writeReplayable } from './write-actions';

export function EditorFeedback({ model }: { model: ContentEditorModel }) {
  const { state, controller, busy, t } = model;
  return (
    <>
      <ManagementFeedback error={state.failure} />
      {state.phase === 'loading' ? <p role="status">{t.loading}</p> : null}
      {state.phase === 'failed' ? (
        <Button
          variant="outline"
          onClick={() => {
            void controller.reload(true);
          }}
        >
          {t.reloadCurrent}
        </Button>
      ) : null}
      {state.pending ? (
        <Banner tone="warning" className="space-y-3">
          <p>{t.pending}</p>
          <Button
            variant="outline"
            disabled={state.busy}
            onClick={() => {
              void controller.retry();
            }}
          >
            {writeReplayable(state.pending.action, state.pending.snapshot.document === null)
              ? t.retryIntent
              : t.reloadCurrent}
          </Button>
        </Banner>
      ) : null}
      {state.failure?.status === 409 || state.latest ? (
        <Banner tone="warning" className="space-y-3">
          <p>{t.conflict}</p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              void controller.readCurrent();
            }}
          >
            {t.reloadCurrent}
          </Button>
          {state.latest ? (
            <div className="space-y-3">
              <pre className="max-h-48 overflow-auto text-xs">
                {JSON.stringify(state.latest.document?.data, null, 2)}
              </pre>
              <Button
                variant="outline"
                onClick={() => {
                  void controller.adoptCurrent();
                }}
              >
                {t.adopt}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  void controller.rebaseCurrent();
                }}
              >
                {t.rebase}
              </Button>
            </div>
          ) : null}
        </Banner>
      ) : null}
    </>
  );
}
