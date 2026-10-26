import type { DeliverySummary } from '../../contracts/access';
import type { AdminsMessages } from './admins-messages';

export function DeliveryStatus({
  delivery,
  messages: t,
}: {
  delivery: DeliverySummary | null;
  messages: AdminsMessages;
}) {
  const labels = {
    pending: t.deliveryPending,
    sending: t.deliverySending,
    accepted: t.deliveryAccepted,
    failed: t.deliveryFailed,
    unknown: t.deliveryUnknown,
  };
  if (!delivery) return <p className="text-sm text-muted-foreground">{t.deliveryNone}</p>;
  return (
    <div className="space-y-2 text-sm">
      <p>{labels[delivery.status]}</p>
      <p className="break-all text-xs text-muted-foreground">
        {t.deliveryId}: {delivery.id}
      </p>
      <p className="text-xs text-muted-foreground">{t.deliveryHint}</p>
    </div>
  );
}
