'use client';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import type { Collection } from '../../contracts/content';
import { presetEditorSchema } from '../../contracts/query-presets';
import type { PresetAccess, PresetEditor } from '../../contracts/query-presets';
import { useAccessControl } from '../access-control/provider';
import { useShell } from '../../components/shell/shell-provider';
import { ManagementFeedback } from '../management-shared/feedback';
import { fieldComponentsAvailable, useAdminComponents } from '../admin-components/registry';
import { FieldRenderer } from '../fields/field-renderer';
import { presetFieldServices } from './preset-field-services';
import { presetCandidateBody, presetCandidateKey } from './preset-candidate';
import type { PresetAction, PresetCandidateContext } from './preset-candidate';
import { queryMessages } from './query-messages';
interface Props {
  context: PresetCandidateContext;
  action: PresetAction;
  access: PresetAccess;
  collections: readonly Collection[];
  readOnly: boolean;
  change: (rule: PresetAccess[PresetAction]) => void;
  validity: (valid: boolean) => void;
  options: (values: PresetEditor['constraints']) => void;
}
interface PreviewState {
  identity: string;
  key: string;
  editor: PresetEditor | null;
  error: Exclude<ApiResult<unknown>, { ok: true }> | null;
}
function usePresetFields(props: Props) {
  const access = useAccessControl();
  const components = useAdminComponents();
  const language = useShell((state) => state.locale);
  const t = queryMessages[language];
  const actor = access.principal.id;
  const key = presetCandidateKey(props.context, props.access, actor);
  const rule = props.access[props.action];
  const identity = JSON.stringify([
    actor,
    props.context.collection.key,
    props.context.collection.behaviorHash,
    props.context.source,
    props.context.locale,
    props.action,
    rule.constraint,
  ]);
  const allowed = access.can('queryPresets.preview', {
    scopeKind: 'collection',
    collectionKey: props.context.collection.key,
  });
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PreviewState>({
    identity: '',
    key: '',
    editor: null,
    error: null,
  });
  const errors = useRef<Record<string, string>>({});
  const current = state.identity === identity ? state : null;
  const status = presetFieldStatus({ allowed, readOnly: props.readOnly, current, key, components });
  const { ready } = status;
  const load = useEffectEvent((signal: AbortSignal, expectedIdentity: string) =>
    expectedIdentity !== identity
      ? Promise.resolve(failure('request_cancelled', 503))
      : requestApi({
          operation: 'queryPresets.preview',
          params: { collection: props.context.collection.key },
          body: { ...presetCandidateBody(props.context, props.access), action: props.action },
          response: presetEditorSchema,
          signal,
        }),
  );
  const receive = useEffectEvent(
    (result: ApiResult<PresetEditor>, requested: string, requestedAttempt: number) => {
      if (!allowed || props.readOnly || requested !== key || requestedAttempt !== attempt) return;
      if (!result.ok) {
        access.reportResult(result);
        setState((previous) => ({
          identity,
          key,
          editor: previous.identity === identity ? previous.editor : null,
          error: result,
        }));
        return;
      }
      if (result.data.behaviorHash !== props.context.collection.behaviorHash) {
        setState({ identity, key, editor: null, error: failure('version_conflict', 409) });
        return;
      }
      props.options(result.data.constraints);
      setState({ identity, key, editor: result.data, error: null });
      const token = result.data.initialSnapshot;
      if (
        JSON.stringify(rule.data ?? {}) !== JSON.stringify(result.data.data) ||
        (rule.initialSnapshot ?? null) !== token
      ) {
        const { initialSnapshot: _old, ...base } = rule;
        props.change({
          ...base,
          data: result.data.data,
          ...(token ? { initialSnapshot: token } : {}),
        });
      }
    },
  );
  useEffect(() => {
    if (!allowed || props.readOnly) return () => {};
    const controller = new AbortController();
    void load(controller.signal, identity)
      .catch(() => failure('invalid_response', 0))
      .then((result) => {
        if (!controller.signal.aborted) receive(result, key, attempt);
        return result;
      });
    return () => controller.abort();
  }, [allowed, props.readOnly, key, identity, attempt]);
  const report = useEffectEvent((requested: string, usable: boolean) => {
    if (requested === key) props.validity(usable && Object.keys(errors.current).length === 0);
  });
  useEffect(() => {
    report(key, ready);
  }, [ready, key]);
  const services = useMemo(
    () =>
      presetFieldServices({
        context: props.context,
        action: props.action,
        access: props.access,
        actor,
        collections: props.collections,
        report: access.reportResult,
      }),
    [props.context, props.action, props.access, actor, props.collections, access.reportResult],
  );
  function reportField(name: string, error: string | null) {
    const { [name]: _old, ...rest } = errors.current;
    errors.current = error === null ? rest : { ...rest, [name]: error };
    props.validity(ready && Object.keys(errors.current).length === 0);
  }
  return { t, allowed, current, ready, identity, services, rule, reportField, setAttempt, status };
}
function presetFieldStatus(input: {
  allowed: boolean;
  readOnly: boolean;
  current: PreviewState | null;
  key: string;
  components: ReturnType<typeof useAdminComponents>;
}) {
  const { allowed, readOnly, current, key, components } = input;
  const editor = current?.editor;
  const available = editor ? fieldComponentsAvailable(editor, components) : false;
  return {
    ready: allowed && !readOnly && current?.key === key && current.error === null && available,
    pending: allowed && !readOnly && current?.key !== key,
    unavailable: !allowed || Boolean(editor && !available),
  };
}
export function QueryPresetCustomFields(props: Props) {
  const { t, allowed, current, ready, identity, services, rule, reportField, setAttempt, status } =
    usePresetFields(props);
  return (
    <div className="min-w-0 space-y-3">
      {status.unavailable ? <p role="alert">{t.customUnavailable}</p> : null}
      {status.pending ? <p role="status">{t.customLoading}</p> : null}
      <ManagementFeedback
        error={current?.error ?? null}
        onRetry={() => setAttempt((value) => value + 1)}
      />
      {allowed && current?.editor ? (
        <FieldRenderer
          key={identity}
          idPrefix={`preset-${props.action}-${identity}`}
          resetKey={identity}
          layout={current.editor.layout}
          value={ready ? current.editor.data : (rule.data ?? current.editor.data)}
          locale={props.context.locale}
          services={services}
          richTextNodes={current.editor.richTextNodes}
          readOnly={!ready}
          active={ready}
          enforceRequired
          visibility={current.editor.visibility}
          {...(current.editor.componentProps
            ? { componentProps: current.editor.componentProps }
            : {})}
          {...(current.editor.choiceOptions ? { choiceOptions: current.editor.choiceOptions } : {})}
          onChange={(data) => props.change({ ...rule, data })}
          onValidityChange={reportField}
        />
      ) : null}
    </div>
  );
}
