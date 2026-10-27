'use client';

import { Button } from '@new-cms/ui/actions';
import type { ContentMessages } from './messages';

export function SelectionActions({
  count,
  t,
  clear,
  onBulk,
}: {
  count: number;
  t: ContentMessages;
  clear: () => void;
  onBulk: (() => void) | undefined;
}) {
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p>
        {t.selected}: {count}
      </p>
      {onBulk ? (
        <Button variant="outline" onClick={onBulk}>
          {t.bulk}
        </Button>
      ) : null}
      <Button variant="ghost" onClick={clear}>
        {t.cancel}
      </Button>
    </div>
  );
}
