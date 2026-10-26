'use client';

import { DownloadIcon } from 'lucide-react';
import { buttonStyles } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { FileDetails } from '../../components/cms/upload-helpers';
import { useShell } from '../../components/shell/shell-provider';
import { ManagementFeedback } from '../management-shared/feedback';
import type { DownloadResponse } from '../../contracts/download';
import { useAssetFile, useBlobUrl } from './use-asset-file';
import type { AssetPreviewProps } from './document-asset-types';
import { assetMessages } from './messages';

export function previewableImage(type: string) {
  return ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'].includes(
    type.toLowerCase().split(';')[0]?.trim() ?? '',
  );
}

function DownloadedFile({
  data,
  label,
  dimensions,
}: {
  data: DownloadResponse;
  label: string;
  dimensions: { width: number; height: number } | null;
}) {
  const locale = useShell((state) => state.locale);
  const t = assetMessages[locale];
  const url = useBlobUrl(data.blob);
  return (
    <FileDetails
      file={{
        name: data.filename ?? label,
        mimeType: data.contentType,
        size: data.bytes,
        ...dimensions,
        ...(url && previewableImage(data.contentType) ? { url } : {}),
      }}
      labels={{
        name: t.filename,
        mimeType: t.mimeType,
        size: t.bytes,
        dimensions: t.dimensions,
        url: t.url,
        unavailable: t.unavailable,
      }}
      formatBytes={(value) => new Intl.NumberFormat(locale).format(value)}
      formatDimensions={(width, height) => `${width} × ${height}`}
      actions={
        url ? (
          <a className={buttonStyles({})} href={url} download={data.filename ?? label}>
            <DownloadIcon />
            {t.download}
          </a>
        ) : null
      }
    />
  );
}

function PreviewResource(props: AssetPreviewProps) {
  const result = useAssetFile(props.target);
  const t = assetMessages[useShell((state) => state.locale)];
  if (!result.allowed) return <Banner tone="warning">{t.denied}</Banner>;
  if (result.error) return <ManagementFeedback error={result.error} onRetry={result.reload} />;
  if (!result.data)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t.loading}
      </p>
    );
  return (
    <DownloadedFile
      key={result.data.etag ?? props.label}
      data={result.data}
      label={props.label}
      dimensions={previewDimensions(props)}
    />
  );
}

export function AssetPreview(props: AssetPreviewProps) {
  return <PreviewResource key={JSON.stringify([props.target, props.manifest?.id])} {...props} />;
}

function previewDimensions({ manifest, target }: AssetPreviewProps) {
  const { variant } = target;
  const object = manifest?.objects.find((entry) => entry.name === (variant ?? 'original'));
  if (object?.width && object.height) return { width: object.width, height: object.height };
  if (!variant && manifest?.width && manifest.height)
    return { width: manifest.width, height: manifest.height };
  return null;
}
