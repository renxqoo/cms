'use client';

import { useState } from 'react';
import { FieldLabel, FieldError } from './configured-field';
import { CodeEditor } from '@new-cms/ui/forms';
import { useFieldValue } from './field-context';
import { parseJson, parseText } from './parsing';
import { useFieldDraft } from './use-field-draft';
import { fieldEditorPolicy } from './policy';
import type { ScalarProps } from './scalar-fields';

export function EditorField({ node, location, readOnly }: ScalarProps) {
  const field = useFieldValue(location);
  const [attempt, setAttempt] = useState(0);
  const initial =
    node.type === 'json'
      ? field.value == null
        ? ''
        : JSON.stringify(field.value, null, 2)
      : typeof field.value === 'string'
        ? field.value
        : '';
  const draft = useFieldDraft({
    initial,
    identity: location.identity,
    invalidMessage: node.type === 'json' ? field.t.invalidJson : field.t.invalid,
    parse: node.type === 'json' ? parseJson : (text) => parseText(text, node),
    onChange: field.change,
    onValidityChange: field.onValidityChange,
  });
  return (
    <>
      <CodeEditor
        key={attempt}
        value={draft.text}
        onChange={draft.change}
        language={node.type === 'json' ? 'json' : 'plaintext'}
        theme={field.theme}
        label={node.label}
        labelContent={<FieldLabel node={node} location={location} readOnly={readOnly} />}
        loadingLabel={field.t.loading}
        errorLabel={field.t.editorError}
        retryLabel={field.t.retry}
        onRetry={() => setAttempt((value) => value + 1)}
        minHeight={fieldEditorPolicy.codeMinHeight}
        maxHeight={fieldEditorPolicy.codeMaxHeight}
        assetBaseUrl={fieldEditorPolicy.codeAssets}
        readOnly={readOnly}
      />
      {draft.error ? (
        <p role="alert" className="text-sm text-destructive">
          <FieldError node={node} location={location} readOnly={readOnly} error={draft.error} />
        </p>
      ) : null}
    </>
  );
}
