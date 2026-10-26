'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { useFieldValue } from './field-context';
import type { richTextData } from './rich-text-value';
import { RichTextStructure } from './rich-text-structure';
import type { ScalarProps } from './scalar-fields';

const VisualEditor = dynamic(() => import('./rich-text-visual'), { ssr: false });

export function RichTextField({ node, location, readOnly }: ScalarProps) {
  const field = useFieldValue(location);
  const value = field.value ?? { version: 1, children: [] };
  const [invalid, setInvalid] = useState(false);
  const [structure, setStructure] = useState(false);
  function change(next: ReturnType<typeof richTextData>) {
    field.change(next);
  }
  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="mb-2 text-sm font-medium">{node.label}</legend>
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          disabled={invalid}
          onClick={() => setStructure(!structure)}
        >
          {structure ? field.t.visual : field.t.structure}
        </Button>
      </div>
      {structure ? (
        <RichTextStructure
          value={value}
          identity={location.identity}
          label={node.label}
          readOnly={readOnly}
          onChange={change}
          onInvalidChange={setInvalid}
        />
      ) : (
        <VisualEditor
          value={value}
          identity={location.identity}
          label={node.label}
          location={location}
          readOnly={readOnly}
          onChange={change}
          onInvalidChange={setInvalid}
        />
      )}
      {field.error ? (
        <p role="alert" className="text-sm text-destructive">
          {field.error}
        </p>
      ) : null}
    </fieldset>
  );
}
