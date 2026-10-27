'use client';

import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { useFieldValue } from './field-context';
import { TextField } from './scalar-fields';
import type { ScalarProps } from './scalar-fields';

export function SlugField(props: ScalarProps) {
  const field = useFieldValue(props.location);
  const [manual, setManual] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <TextField {...props} readOnly={props.readOnly || !manual} />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={props.readOnly}
          aria-pressed={manual}
          onClick={() => setManual((value) => !value)}
        >
          {manual ? field.t.slugAutomatic : field.t.slugManual}
        </Button>
      </div>
      {!field.value ? (
        <p className="text-xs text-muted-foreground">{field.t.slugGenerated}</p>
      ) : null}
    </div>
  );
}
