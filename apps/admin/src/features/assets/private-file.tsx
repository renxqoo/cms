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
  locale?: string;
  fallback?: readonly string[];
}

function usePrivateFile({
  target,
  manifest,
  onPreview,
  initialVariant,
}: {
  target: PrivateFileTarget;
  manifest: Manifest;
  onPreview?: (url: string | null) => void;
  initialVariant?: string;
}) {
  const { can, reportResult } = useAccessControl();
  const previewChanged = useEffectEvent((url: string | null) => onPreview?.(url));
  const [selectedVariant, setVariant] = useState<string | null>(null);
  const requestedVariant = selectedVariant ?? initialVariant ?? 'original';
  const variant = manifest.objects.some((object) => object.name === requestedVariant)
    ? requestedVariant
    : 'original';
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    url: string | null;
    filename: string | null;
    error: ApiFailure | null;
    loading: boolean;
  }>({ key: '', url: null, filename: null, error: null, loading: false });
  const operation = target.bindingId ? 'assets.downloadBinding' : 'assets.download';
  const allowed = can(operation, { scopeKind: 'collection', collectionKey: target.collection });
  const fallback = target.fallback?.join(',');
  const key = JSON.stringify([
    target.collection,
    target.id,
    target.versionId,
    target.bindingId,
    target.mode,
    target.locale,
    fallback,
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
        ...(target.locale ? { locale: target.locale } : {}),
        ...(fallback === undefined ? {} : { fallback: fallback ? fallback.split(',') : [] }),
        mode: target.mode ?? 'editing',
        variant,
      },
      response: downloadResponseSchema,
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return result;
      if (result.ok) {
        objectUrl = URL.createObjectURL(result.data.blob);
        setState({
          key,
          url: objectUrl,
          filename: result.data.filename,
          error: null,
          loading: false,
        });
        previewChanged(objectUrl);
      } else {
        setState({ key, url: null, filename: null, error: result, loading: false });
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
    target.locale,
    fallback,
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

export function PrivateThumbnail(props: { target: PrivateFileTarget; manifest: Manifest }) {
  const [image] = props.manifest.objects
    .filter((object) => object.mimeType.startsWith('image/'))
    .toSorted((left, right) => left.bytes - right.bytes);
  if (!image) return null;
  return <ThumbnailImage {...props} variant={image.name} />;
}
function ThumbnailImage(props: { target: PrivateFileTarget; manifest: Manifest; variant: string }) {
  const { state, reload, allowed } = usePrivateFile({ ...props, initialVariant: props.variant });
  const locale = useShell((value) => value.locale);
  const t = assetMessages[locale];
  if (!allowed) return null;
  return state?.url ? (
    <img
      src={state.url}
      alt={props.manifest.filename}
      className="size-12 shrink-0 rounded-md object-cover"
    />
  ) : state?.error ? (
    <Button
      size="sm"
      variant="ghost"
      onClick={reload}
      aria-label={`${t.reload} ${props.manifest.filename}`}
    >
      {t.reload}
    </Button>
  ) : (
    <span role="status" className="size-12 shrink-0 rounded-md bg-muted" aria-label={t.pending} />
  );
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
      {!allowed ? <Banner tone="warning">{t.downloadDenied}</Banner> : null}
      <ManagementFeedback error={state?.error ?? null} onRetry={reload} />
      {allowed && state === null ? <p role="status">{t.pending}</p> : null}
      {state?.url ? (
        <PrivateContent
          url={state.url}
          filename={state.filename ?? props.manifest.filename}
          image={object?.mimeType.startsWith('image/') === true}
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
}: {
  url: string;
  filename: string;
  image: boolean;
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
        download={filename}
      >
        {t.download}
      </a>
    </>
  );
}
