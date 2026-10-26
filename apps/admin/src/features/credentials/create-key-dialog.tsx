'use client';

import { useId, useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { CopyButton } from '@new-cms/ui/feedback';
import { Field, Input } from '@new-cms/ui/forms';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@new-cms/ui/overlays';
import { useShell } from '../../components/shell/shell-provider';
import { managementFeedbackPolicy } from '../management-shared/policy';
import { credentialMessages } from './credential-messages';
import { KeyCreateForm } from './key-create-form';

export function CreateKeyDialog({ onClose }: { onClose: () => void }) {
  const id = useId();
  const t = credentialMessages[useShell((state) => state.locale)];
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent closeLabel={t.close} showCloseButton={!pending} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{secret ? t.secretTitle : t.create}</DialogTitle>
          <DialogDescription>{secret ? t.secretHint : t.createDescription}</DialogDescription>
        </DialogHeader>
        {secret ? (
          <>
            <Field id={`${id}-secret`} label={t.secret}>
              <Input
                value={secret}
                readOnly
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
            </Field>
            <CopyButton
              value={secret}
              label={t.secret}
              copiedLabel={t.copied}
              errorLabel={t.copyFailed}
              feedbackDurationMs={managementFeedbackPolicy.copyFeedbackMs}
            />
            <DialogFooter>
              <Button onClick={onClose}>{t.savedSecret}</Button>
            </DialogFooter>
          </>
        ) : (
          <KeyCreateForm onCreated={setSecret} onClose={onClose} onPendingChange={setPending} />
        )}
      </DialogContent>
    </Dialog>
  );
}
