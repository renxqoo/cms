'use client';

import { Button } from '@new-cms/ui/actions';
import { CopyButton } from '@new-cms/ui/feedback';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@new-cms/ui/overlays';
import { useShell } from '../../components/shell/shell-provider';
import type { Audit } from '../../contracts/access';
import { managementFeedbackPolicy } from '../management-shared/policy';
import { auditDate } from './audit-query';
import { auditMessages } from './audit-messages';

export function AuditDetail({ record, onClose }: { record: Audit; onClose: () => void }) {
  const locale = useShell((state) => state.locale);
  const t = auditMessages[locale];
  const values = [
    [t.id, record.id],
    [t.time, auditDate(new Date(record.createdAt), locale)],
    [t.actor, record.actorKind === 'system' ? t.system : t.admin],
    [t.actorId, record.actorId ?? '—'],
    [t.operation, record.operationId],
    [t.targetType, record.targetType],
    [t.targetId, record.targetId ?? '—'],
    [t.requestId, record.requestId],
  ];
  const detail = JSON.stringify(record.detail, null, 2);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent closeLabel={t.close} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.detailTitle}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <dl className="grid gap-4 sm:grid-cols-2">
          {values.map(([label, value]) => (
            <div key={label} className="space-y-1">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm break-all">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{t.payload}</h3>
          <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap break-words">
            {detail}
          </pre>
        </div>
        <DialogFooter>
          <CopyButton
            value={record.requestId}
            label={t.copyRequestId}
            copiedLabel={t.copied}
            errorLabel={t.copyFailed}
            feedbackDurationMs={managementFeedbackPolicy.copyFeedbackMs}
          />
          <CopyButton
            value={detail}
            label={t.copy}
            copiedLabel={t.copied}
            errorLabel={t.copyFailed}
            feedbackDurationMs={managementFeedbackPolicy.copyFeedbackMs}
          />
          <Button variant="outline" onClick={onClose}>
            {t.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
