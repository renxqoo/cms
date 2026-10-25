'use client';

import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@new-cms/ui/layout';
import { DeliveryStatus } from './delivery-status';
import type { AdminEditorFlow } from './admin-editor-form';
import type { AdminsMessages } from './admins-messages';

export function AdminInvitation({
  flow,
  canInvite,
  messages: t,
}: {
  flow: AdminEditorFlow;
  canInvite: boolean;
  messages: AdminsMessages;
}) {
  const eligible = flow.observed.status === 'active' && flow.observed.activation === 'pending';
  const unknown = flow.error?.uncertain === true && flow.lastOperation === 'invite';
  const blocked = flow.phase !== 'idle' || (flow.locked && !unknown);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.invitation}</CardTitle>
        <CardDescription>{t.inviteHint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <DeliveryStatus delivery={flow.delivery} messages={t} />
        {unknown ? <Banner tone="warning">{t.unknownIntent}</Banner> : null}
        {canInvite && eligible ? (
          <Button
            variant="outline"
            busy={flow.phase === 'inviting'}
            disabled={blocked}
            onClick={() => void flow.invite()}
          >
            {unknown ? t.retryIntent : t.invite}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
