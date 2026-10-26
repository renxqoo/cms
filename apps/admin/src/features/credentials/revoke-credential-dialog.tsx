'use client';

import { Button } from '@new-cms/ui/actions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@new-cms/ui/overlays';
import { requestApi } from '../../api/client';
import { useShell } from '../../components/shell/shell-provider';
import { emptyResponseSchema } from '../../contracts/auth';
import { clientRevocationSchema } from '../../contracts/credentials';
import type { Credential } from '../../contracts/credentials';
import { useAccessControl } from '../access-control/provider';
import { ManagementFeedback } from '../management-shared/feedback';
import { credentialMessages } from './credential-messages';
import { useCredentialAction } from './use-credential-action';

export function RevokeCredentialDialog({
  credential,
  all,
  onClose,
  onRevoked,
}: {
  credential: Credential;
  all: boolean;
  onClose: () => void;
  onRevoked: () => void;
}) {
  const t = credentialMessages[useShell((state) => state.locale)];
  const access = useAccessControl();
  const action = useCredentialAction();
  async function revoke() {
    const result = await action.run(async (signal) => {
      if (all && credential.clientId)
        return requestApi({
          operation: 'credentials.revokeClient',
          params: { clientId: credential.clientId },
          body: {},
          response: clientRevocationSchema,
          signal,
        });
      const response = await requestApi({
        operation: 'credentials.revoke',
        params: { id: credential.id },
        response: emptyResponseSchema,
        signal,
      });
      return response.ok ? { ...response, data: { revoked: 1 } } : response;
    });
    if (!result) return;
    access.reportResult(result);
    if (result.ok) onRevoked();
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !action.pending) onClose();
      }}
    >
      <DialogContent closeLabel={t.close} showCloseButton={!action.pending}>
        <DialogHeader>
          <DialogTitle>{t.confirmRevoke}</DialogTitle>
          <DialogDescription>{all ? t.revokeClientHint : t.revokeHint}</DialogDescription>
        </DialogHeader>
        <p className="break-all">
          {all ? (credential.clientName ?? credential.clientId) : credential.name}
        </p>
        <ManagementFeedback error={action.error} />
        <DialogFooter>
          {action.pending ? (
            <Button variant="outline" onClick={action.cancel}>
              {t.cancel}
            </Button>
          ) : (
            <Button variant="outline" onClick={onClose}>
              {t.close}
            </Button>
          )}
          <Button variant="destructive" busy={action.pending} onClick={() => void revoke()}>
            {t.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
