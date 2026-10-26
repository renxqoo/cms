'use client';

import { useEffect, useEffectEvent, useId, useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Field, NativeSelect } from '@new-cms/ui/forms';
import { Banner } from '@new-cms/ui/feedback';
import { requestApi } from '../../api/client';
import { downloadResponseSchema } from '../../contracts/download';
import type { Manifest } from '../../contracts/assets';
import { useShell } from '../../components/shell/shell-provider';
import { useAccessControl } from '../access-control/provider';
import { ManagementFeedback } from '../management-shared/feedback';
import type { ApiFailure } from '../management-shared/read-all-pages';
import { assetMessages } from './asset-messages';

export interface PrivateFileTarget {
  collection: string;
  id: string;
  versionId?: string;
  bindingId?: string;
  mode?: 'editing' | 'published';
}

function usePrivateFile({
  target,
  manifest,
  onPreview,
}: {
  target: PrivateFileTarget;
  manifest: Manifest;
  onPreview?: (url: string | null) => void;
}) {
  const { can, reportResult } = useAccessControl();
  const previewChanged = useEffectEvent((url: string | null) => onPreview?.(url));
  const [variant, setVariant] = useState('original');
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    url: string | null;
    error: ApiFailure | null;
    loading: boolean;
  }>({ key: '', url: null, error: null, loading: false });
  const operation = target.bindingId ? 'assets.downloadBinding' : 'assets.download';
  const allowed = can(operation, { scopeKind: 'collection', collectionKey: target.collection });
  const key = JSON.stringify([
    target.collection,
    target.id,
    target.versionId,
    target.bindingId,
    target.mode,
    manifest.id,
    variant,
    attempt,
    allowed,
  ]);
  useEffect(() => {
    if (!allowed) return () => {};

    const controller = new AbortController();
    let objectUrl: string | null = null;
    void requestApi({
      operation,
      params: {
        collection: target.collection,
        id: target.id,
        ...(target.bindingId ? { bindingId: target.bindingId } : {}),
      },
      query: {
        ...(target.versionId ? { versionId: target.versionId } : {}),
        mode: target.mode ?? 'editing',
        variant,
      },
      response: downloadResponseSchema,
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return result;
      if (result.ok) {
        objectUrl = URL.createObjectURL(result.data.blob);
        setState({ key, url: objectUrl, error: null, loading: false });
        previewChanged(objectUrl);
      } else {
        setState({ key, url: null, error: result, loading: false });
        previewChanged(null);
        reportResult(result);
      }
      return result;
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      previewChanged(null);
    };
  }, [
    key,
    allowed,
    operation,
    target.collection,
    target.id,
    target.versionId,
    target.bindingId,
    target.mode,
    variant,
    reportResult,
  ]);
  return {
    state: state.key === key && allowed ? state : null,
    variant,
    setVariant,
    allowed,
    reload: () => setAttempt((value) => value + 1),
  };
}

export function PrivateFile(props: {
  target: PrivateFileTarget;
  manifest: Manifest;
  onPreview?: (url: string | null) => void;
  originalOnly?: boolean;
}) {
  const locale = useShell((value) => value.locale);
  const t = assetMessages[locale];
  const id = useId();
  const { state, variant, setVariant, allowed, reload } = usePrivateFile(props);
  const object = props.manifest.objects.find((value) => value.name === variant);
  return (
    <section aria-label={t.preview} className="space-y-3">
      {!props.originalOnly ? (
        <Field id={`${id}-variant`} label={t.variant}>
          <NativeSelect value={variant} onChange={(event) => setVariant(event.currentTarget.value)}>
            {props.manifest.objects.map((value) => (
              <option key={value.name} value={value.name}>
                {value.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
      {!allowed ? <Banner tone="warning">{t.dependencies}</Banner> : null}
      <ManagementFeedback error={state?.error ?? null} onRetry={reload} />
      {allowed && state === null ? <p role="status">{t.pending}</p> : null}
      {state?.url ? (
        <PrivateContent
          url={state.url}
          filename={props.manifest.filename}
          image={object?.mimeType.startsWith('image/') === true}
          variant={variant}
        />
      ) : null}
      {allowed ? (
        <Button variant="outline" size="sm" onClick={reload}>
          {t.reload}
        </Button>
      ) : null}
    </section>
  );
}

function PrivateContent({
  url,
  filename,
  image,
  variant,
}: {
  url: string;
  filename: string;
  image: boolean;
  variant: string;
}) {
  const locale = useShell((value) => value.locale);
  const t = assetMessages[locale];
  return (
    <>
      {image ? (
        <img src={url} alt={filename} className="max-h-80 max-w-full rounded-lg object-contain" />
      ) : (
        <p className="text-sm text-muted-foreground">{t.unsupportedPreview}</p>
      )}
      <a
        className="inline-flex min-h-8 items-center rounded-lg border px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/50"
        href={url}
        download={variant === 'original' ? filename : `${variant}-${filename}`}
      >
        {t.download}
      </a>
    </>
  );
}
