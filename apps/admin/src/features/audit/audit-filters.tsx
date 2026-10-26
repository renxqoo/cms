'use client';

import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { Field, Input } from '@new-cms/ui/forms';
import { auditFilterValues } from './audit-query';
import type { AuditQuery } from './audit-query';
import { auditMessages } from './audit-messages';

export function AuditFilterForm({
  query,
  onApply,
  onClear,
  locale,
}: {
  query: AuditQuery;
  onApply: (query: AuditQuery) => void;
  onClear: () => void;
  locale: 'zh' | 'en';
}) {
  const [invalid, setInvalid] = useState(false);
  const t = auditMessages[locale];
  return (
    <form
      className="space-y-4 rounded-xl bg-card p-4 ring-1 ring-border/50"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = auditFilterValues(new FormData(event.currentTarget));
        setInvalid(!parsed.success);
        if (parsed.success)
          onApply({
            page: 1,
            pageSize: query.pageSize,
            q: query.q,
            sortBy: 'createdAt',
            order: query.order,
            ...parsed.data,
          });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Field id="audit-actor" name="actorId" label={t.actorId}>
          <Input defaultValue={query.actorId ?? ''} maxLength={36} />
        </Field>
        <Field id="audit-operation" name="operationId" label={t.operation}>
          <Input defaultValue={query.operationId ?? ''} maxLength={128} />
        </Field>
        <Field id="audit-type" name="targetType" label={t.targetType}>
          <Input defaultValue={query.targetType ?? ''} maxLength={64} />
        </Field>
        <Field id="audit-target" name="targetId" label={t.targetId}>
          <Input defaultValue={query.targetId ?? ''} maxLength={160} />
        </Field>
        <Field id="audit-from" name="from" label={t.from}>
          <Input type="datetime-local" step={60} defaultValue={query.from?.slice(0, 16) ?? ''} />
        </Field>
        <Field id="audit-to" name="to" label={t.to}>
          <Input type="datetime-local" step={60} defaultValue={query.to?.slice(0, 16) ?? ''} />
        </Field>
      </div>
      {invalid ? <Banner tone="error">{t.invalid}</Banner> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="outline">
          {t.apply}
        </Button>
        <Button variant="ghost" onClick={onClear}>
          {t.clear}
        </Button>
      </div>
    </form>
  );
}
