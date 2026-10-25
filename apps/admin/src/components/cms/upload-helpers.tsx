'use client';

import type { ReactNode } from 'react';
import { Thumbnail } from '@new-cms/ui/data';
import { NativeSelect } from '@new-cms/ui/forms';
import { safeResourceUrl } from './safe-url';

export interface FileInfo {
  name: string;
  mimeType: string;
  size: number;
  url?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
}

export interface FileDetailLabels {
  name: string;
  mimeType: string;
  size: string;
  dimensions: string;
  url: string;
  unavailable: string;
}

interface FileDetailsProps {
  file: FileInfo;
  labels: FileDetailLabels;
  formatBytes(this: void, value: number): string;
  formatDimensions(this: void, width: number, height: number): string;
  actions?: ReactNode;
}

export function FileDetails({
  file,
  labels,
  formatBytes,
  formatDimensions,
  actions,
}: FileDetailsProps) {
  const url = safeResourceUrl(file.url, true);
  const metadata = [
    [labels.name, file.name],
    [labels.mimeType, file.mimeType],
    [labels.size, formatBytes(file.size)],
    ...(file.width !== undefined && file.height !== undefined
      ? [[labels.dimensions, formatDimensions(file.width, file.height)]]
      : []),
  ];
  return (
    <div className="space-y-3 rounded-xl border border-border/60 p-4">
      <Thumbnail
        src={file.mimeType.startsWith('image/') ? url : null}
        alt={file.name}
        filename={file.name}
        fallbackLabel={labels.unavailable}
        mimeType={file.mimeType}
        className="h-auto min-h-12 w-full max-h-52 object-contain"
      />
      <dl className="grid min-w-0 grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {metadata.map(([label, value]) => (
          <div className="contents" key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
        {url ? (
          <>
            <dt className="text-muted-foreground">{labels.url}</dt>
            <dd className="min-w-0 break-all">
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {url}
              </a>
            </dd>
          </>
        ) : null}
      </dl>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export interface PreviewSize {
  id: string;
  label: string;
  file: FileInfo;
}

export function PreviewSizes({
  variants,
  selectedId,
  onChange,
  label,
  ...details
}: {
  variants: readonly PreviewSize[];
  selectedId: string;
  onChange(this: void, id: string): void;
  label: string;
} & Omit<FileDetailsProps, 'file' | 'actions'>) {
  const selected = variants.find((variant) => variant.id === selectedId);
  return (
    <div className="space-y-3">
      <NativeSelect
        aria-label={label}
        value={selected?.id ?? ''}
        onChange={(event) => {
          if (variants.some((variant) => variant.id === event.currentTarget.value))
            onChange(event.currentTarget.value);
        }}
      >
        {!selected ? (
          <option value="" disabled>
            {details.labels.unavailable}
          </option>
        ) : null}
        {variants.map((variant) => (
          <option key={variant.id} value={variant.id}>
            {variant.label}
          </option>
        ))}
      </NativeSelect>
      {selected ? (
        <FileDetails {...details} file={selected.file} />
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          {details.labels.unavailable}
        </p>
      )}
    </div>
  );
}
