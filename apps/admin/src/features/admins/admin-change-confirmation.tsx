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
import type { RoleListItem } from '../../contracts/access';
import type { AdminEditorFlow } from './admin-editor-form';
import type { AdminsMessages } from './admins-messages';

export function AdminChangeConfirmation({
  flow,
  roles,
  enabled,
  messages: t,
}: {
  flow: AdminEditorFlow;
  roles: readonly RoleListItem[];
  enabled: boolean;
  messages: AdminsMessages;
}) {
  const nextRole = roles.find((role) => role.id === flow.confirmation?.roleId);
  return (
    <Dialog
      open={flow.confirmation !== null}
      onOpenChange={(open) => {
        if (!open) flow.cancelConfirmation();
      }}
    >
      <DialogContent closeLabel={t.close}>
        <DialogHeader>
          <DialogTitle>{t.confirmTitle}</DialogTitle>
          <DialogDescription>{t.confirmDescription}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <p className="break-all">{flow.baseline.email}</p>
          {flow.confirmation?.roleId ? (
            <p>
              {t.role}: {flow.baseline.roleCode} → {nextRole?.name ?? flow.confirmation.roleId}
            </p>
          ) : null}
          {flow.confirmation?.status ? (
            <p>
              {t.status}: {t[flow.baseline.status]} → {t[flow.confirmation.status]}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={flow.cancelConfirmation}>
            {t.cancel}
          </Button>
          <Button
            variant={flow.confirmation?.status === 'archived' ? 'destructive' : 'default'}
            disabled={!enabled}
            onClick={() => void flow.confirm()}
          >
            {t.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
