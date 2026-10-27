'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ParsedField } from './parsing';
import type { JsonValue } from './types';

interface DraftInput {
  initial: string;
  identity: string;
  invalidMessage: string;
  parse: (text: string) => ParsedField;
  onChange: (value: JsonValue) => void;
  onValidityChange: (identity: string, error: string | null) => void;
}

export function useFieldDraft(input: DraftInput) {
  const [text, setText] = useState(input.initial);
  const [error, setError] = useState<string | null>(() =>
    input.parse(input.initial).valid ? null : input.invalidMessage,
  );
  const report = useEffectEvent((identity: string, message: string | null) =>
    input.onValidityChange(identity, message),
  );
  const currentError = useRef(error);
  useEffect(() => {
    report(input.identity, currentError.current);
    return () => report(input.identity, null);
  }, [input.identity]);
  function change(next: string) {
    setText(next);
    const parsed = input.parse(next);
    const message = parsed.valid ? null : input.invalidMessage;
    currentError.current = message;
    setError(message);
    input.onValidityChange(input.identity, message);
    if (parsed.valid) input.onChange(parsed.value);
  }
  return { text, error, change };
}
