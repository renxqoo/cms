'use client';

import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { useShell } from '../../components/shell/shell-provider';
import { ManagementFeedback } from '../management-shared/feedback';
import { useAccessControl } from '../access-control/provider';
import type { ContentEditorModel } from './use-content-editor';
import { collaborationMessages } from './collaboration-messages';

export function EditorCollaboration({ model }: { model: ContentEditorModel }) {
  const locale = useShell((state) => state.locale);
  const t = collaborationMessages[locale];
  const access = useAccessControl();
  const { lease } = model;
  if (!lease.enabled) return null;
  const owner = lease.value?.lease;
  return (
    <div className="space-y-2" aria-live="polite">
      {lease.phase === 'owned' ? (
        <p className="text-sm text-muted-foreground">{t.owned}</p>
      ) : (
        <Banner tone="warning">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p>
                {lease.phase === 'loading'
                  ? t.acquiring
                  : lease.phase === 'occupied' && owner
                    ? `${t.occupied} ${owner.displayName ?? t.other}`
                    : t.paused}
              </p>
              {owner ? (
                <p className="text-sm">
                  {t.expires}{' '}
                  <time dateTime={owner.expiresAt}>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: 'short',
                      timeStyle: 'medium',
                    }).format(new Date(owner.expiresAt))}
                  </time>
                </p>
              ) : null}
            </div>
            {lease.phase !== 'loading' ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    void lease.retry();
                  }}
                >
                  {t.retry}
                </Button>
                {owner &&
                access.can('documents.unlock', {
                  scopeKind: 'collection',
                  collectionKey: model.props.collectionKey,
                }) ? (
                  <Button
                    onClick={() => {
                      void lease.takeover();
                    }}
                  >
                    {t.takeover}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </Banner>
      )}
      <ManagementFeedback error={lease.error} />
    </div>
  );
}
