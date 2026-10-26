'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import type { Document } from '../../../contracts/documents';
import type { ApiResult } from '../../../api/result';
import { ManagementFeedback } from '../../management-shared/feedback';
import type { contentMessages } from '../messages';
import { readDefaultLanguage, requestDefaultLanguage } from './default-language-request';
import type { DefaultLanguageIntent } from './default-language-request';
interface Props {
  document: Document;
  permitted: boolean;
  disabled: boolean;
  onChanged: () => void;
  onBusy: (value: boolean) => void;
  report: (result: ApiResult<unknown>) => void;
  t: (typeof contentMessages)['en' | 'zh'];
}
export function DefaultLanguageControl(props: Props) {
  const flow = useDefaultLanguage(props);
  if (
    !props.permitted ||
    props.document.collection !== 'languages' ||
    props.document.data['enabled'] !== true ||
    props.document.data['default'] === true
  )
    return null;
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        disabled={props.disabled || flow.pending}
        onClick={() => {
          void flow.submit();
        }}
      >
        {props.t.setDefaultLanguage}
      </Button>
      <ManagementFeedback error={flow.failure} />
    </div>
  );
}
function useDefaultLanguage(props: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Extract<ApiResult<unknown>, { ok: false }> | null>(null);
  const active = useRef<AbortController | null>(null),
    intent = useRef<DefaultLanguageIntent | null>(null);
  const { onBusy } = props;
  useEffect(
    () => () => {
      active.current?.abort();
      onBusy(false);
    },
    [onBusy],
  );
  async function submit() {
    if (active.current || props.disabled) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setError(null);
    onBusy(true);
    try {
      if (!intent.current) {
        const result = await readDefaultLanguage(controller.signal);
        if (controller.signal.aborted) return;
        if (!result.ok) {
          props.report(result);
          setError(result);
          return;
        }
        intent.current = { expectedDefaultCode: result.data, key: crypto.randomUUID() };
      }
      const result = await requestDefaultLanguage(
        props.document,
        intent.current,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      props.report(result);
      if (result.ok || !result.uncertain) intent.current = null;
      if (result.ok) props.onChanged();
      else setError(result);
    } finally {
      if (active.current === controller) active.current = null;
      if (!controller.signal.aborted) {
        setPending(false);
        onBusy(false);
      }
    }
  }
  return { pending, failure: error, submit };
}
