'use client';

import { useState } from 'react';
import { CodeEditor, NativeSelect } from '@new-cms/ui/forms';
import { Button } from '@new-cms/ui/actions';
import { PlusIcon } from 'lucide-react';
import { useFields } from './field-context';
import { fieldEditorPolicy } from './policy';
import { parseJson } from './parsing';
import { parseRichText, richTextData, richTextNode } from './rich-text-value';
import { useFieldDraft } from './use-field-draft';
import type { FieldData, JsonValue } from './types';

export interface RichTextStructureProps {
  value: JsonValue;
  identity: string;
  label: string;
  readOnly: boolean;
  onChange: (value: FieldData) => void;
  onInvalidChange: (invalid: boolean) => void;
}

export function RichTextStructure({
  value,
  identity,
  label,
  readOnly,
  onChange,
  onInvalidChange,
}: RichTextStructureProps) {
  const field = useFields();
  const [type, setType] = useState('paragraph');
  const [attempt, setAttempt] = useState(0);
  const draft = useFieldDraft({
    initial: JSON.stringify(value, null, 2),
    identity,
    invalidMessage: field.t.invalidRich,
    parse: (text) => {
      const json = parseJson(text);
      const rich = json.valid && parseRichText(json.value, field.richTextNodes);
      return { valid: Boolean(rich), value: rich ? richTextData(rich) : null };
    },
    onChange: (next) => {
      const parsed = parseRichText(next, field.richTextNodes);
      if (parsed) onChange(richTextData(parsed));
    },
    onValidityChange: (key, error) => {
      field.onValidityChange(key, error);
      onInvalidChange(error !== null);
    },
  });
  function add() {
    const parsed = parseRichText(parseJson(draft.text).value, field.richTextNodes);
    if (parsed)
      draft.change(
        JSON.stringify({ version: 1, children: [...parsed.children, richTextNode(type)] }, null, 2),
      );
  }
  const choices = [
    { key: 'paragraph', label: field.t.paragraph },
    { key: 'heading', label: field.t.heading },
    { key: 'list', label: field.t.list },
    { key: 'quote', label: field.t.quote },
    { key: 'horizontalRule', label: field.t.horizontalRule },
    { key: 'text', label: field.t.text },
    { key: 'link', label: field.t.link },
  ];
  return (
    <div className="space-y-3">
      {!readOnly ? (
        <div className="flex gap-2">
          <NativeSelect
            aria-label={field.t.nodeType}
            value={type}
            onChange={(event) => setType(event.currentTarget.value)}
          >
            {choices.map((choice) => (
              <option key={choice.key} value={choice.key}>
                {choice.label}
              </option>
            ))}
          </NativeSelect>
          <Button variant="outline" onClick={add} disabled={Boolean(draft.error)}>
            <PlusIcon />
            {field.t.add}
          </Button>
        </div>
      ) : null}
      <CodeEditor
        key={attempt}
        value={draft.text}
        onChange={draft.change}
        language="json"
        theme={field.theme}
        label={label}
        loadingLabel={field.t.loading}
        errorLabel={field.t.editorError}
        retryLabel={field.t.retry}
        onRetry={() => setAttempt((current) => current + 1)}
        minHeight={fieldEditorPolicy.codeMinHeight}
        maxHeight={fieldEditorPolicy.codeMaxHeight}
        assetBaseUrl={fieldEditorPolicy.codeAssets}
        readOnly={readOnly}
      />
      {draft.error ? (
        <p role="alert" className="text-sm text-destructive">
          {draft.error}
        </p>
      ) : null}
    </div>
  );
}
