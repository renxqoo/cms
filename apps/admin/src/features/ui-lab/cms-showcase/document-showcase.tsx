'use client';

import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Field, Input } from '@new-cms/ui/forms';
import { DocumentActions } from '../../../components/cms/document-actions';
import type { DocumentAction } from '../../../components/cms/document-actions';
import { DocumentState } from '../../../components/cms/document-state';
import { BulkDocumentActions } from '../../../components/cms/bulk-document-actions';
import type { CmsCopy } from '../cms-messages';

export function DocumentShowcase({
  copy,
  onDirtyChange,
  onNavigate,
}: {
  copy: CmsCopy;
  onDirtyChange(this: void, dirty: boolean): void;
  onNavigate(this: void, href: string): void;
}) {
  const [title, setTitle] = useState('OneAster draft');
  const [baseline, setBaseline] = useState('OneAster draft');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [fail, setFail] = useState(false);
  const [locked, setLocked] = useState(true);
  const [event, setEvent] = useState('');
  const dirty = title !== baseline;
  function localAction(action: DocumentAction) {
    setEvent(`${copy.event}: ${action}`);
    if (fail || (!title.trim() && action !== 'delete'))
      return Promise.resolve({ status: 'error' as const, message: copy.action.error });
    if (action === 'delete') {
      setTitle('');
      setBaseline('');
    } else setBaseline(title);
    if (action === 'publish') setStatus('published');
    if (action === 'unpublish') setStatus('draft');
    onDirtyChange(false);
    return Promise.resolve({ status: 'success' as const });
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{copy.simulated}</p>
      <Field id="cms-example-title" label={copy.titleLabel}>
        <Input
          value={title}
          onChange={(change) => {
            setTitle(change.currentTarget.value);
            onDirtyChange(change.currentTarget.value !== baseline);
          }}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={fail}
          onChange={(change) => setFail(change.currentTarget.checked)}
          className="accent-primary"
        />
        {copy.fail}
      </label>
      <DocumentState
        dirty={dirty}
        lock={locked ? { ownerName: 'OneAster Studio', isOwnedByCurrentUser: false } : null}
        conflict={fail}
        labels={copy.state}
        onTakeover={() => {
          setLocked(false);
          setEvent(copy.state.takeover);
          return Promise.resolve({ status: 'success' });
        }}
        onRestore={() => {
          setEvent(copy.state.restore);
          return Promise.resolve({ status: 'error', message: copy.state.error });
        }}
      />
      <DocumentActions
        mode="update"
        draftsEnabled
        status={status}
        dirty={dirty}
        busy={false}
        uploadPending={false}
        permissions={{ create: true, update: true, publish: true, delete: true }}
        labels={copy.action}
        onAction={localAction}
      />
      <BulkDocumentActions
        selected={[
          { collection: 'articles', id: '1', label: copy.welcome },
          { collection: 'media', id: '1', label: copy.hero },
        ]}
        action="publish"
        labels={{
          action: copy.batch,
          success: copy.localValid,
          error: copy.localInvalid,
          empty: copy.relationship.empty,
          cancel: copy.action.cancel,
          confirmationTitle: copy.action.confirmationTitle,
          confirmationDescription: copy.action.confirmationDescription,
          confirm: copy.action.confirm,
          close: copy.action.close,
        }}
        onAction={(_action, { items }) =>
          Promise.resolve({
            status: 'success',
            items: items.map((item, index) => ({
              collection: item.collection,
              id: item.id,
              status: index === 0 ? 'success' : 'error',
              message: index === 0 ? copy.localValid : copy.localInvalid,
            })),
          })
        }
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => onNavigate('/ui/lists')}>
          {copy.leave}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setTitle('OneAster draft');
            setBaseline('OneAster draft');
            setStatus('draft');
            setEvent('');
            onDirtyChange(false);
          }}
        >
          {copy.reset}
        </Button>
      </div>
      {event ? (
        <output aria-label={copy.event} className="block text-sm text-muted-foreground">
          {event}
        </output>
      ) : null}
    </div>
  );
}
