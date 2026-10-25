'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Input } from '@new-cms/ui/forms';
import { Dropzone } from './dropzone';
import type { DropzoneLabels, FileLimits, FileRejection } from './dropzone';
import { inspectFiles } from './file-intake';
import { useFilePreviews } from './file-previews';
import { FileDetails } from './upload-helpers';
import type { FileDetailLabels, FileInfo } from './upload-helpers';
import { safeResourceUrl } from './safe-url';

export type UploadStatus = 'queued' | 'uploading' | 'processing' | 'ready' | 'error' | 'canceled';
export interface UploadItem extends FileInfo {
  id: string;
  progress: number;
  status: UploadStatus;
  error?: string;
  file?: File;
}
export interface UploadLabels {
  label: string;
  progress: string;
  cancel: string;
  retry: string;
  replace: string;
  remove: string;
  remoteUrl: string;
  useUrl: string;
  invalidUrl: string;
  statuses: Record<UploadStatus, string>;
}

export interface UploadProps {
  items: readonly UploadItem[];
  limits: FileLimits;
  labels: UploadLabels;
  dropzoneLabels: DropzoneLabels;
  fileLabels: FileDetailLabels;
  readOnly?: boolean;
  customActions?: ReactNode;
  formatBytes(this: void, value: number): string;
  formatDimensions(this: void, width: number, height: number): string;
  onFiles(this: void, files: File[]): void;
  onReject(this: void, rejections: FileRejection[]): void;
  onRemoteUrl(this: void, url: string): void;
  onCancel(this: void, id: string): void;
  onRetry(this: void, id: string): void;
  onReplace(this: void, id: string, file: File): void;
  onRemove(this: void, id: string): void;
}

function UploadActions({ item, props }: { item: UploadItem; props: UploadProps }) {
  if (props.readOnly) return null;
  const pending = item.status === 'uploading' || item.status === 'processing';
  return (
    <div className="flex flex-wrap items-center gap-2">
      {pending ? (
        <Button variant="outline" size="sm" onClick={() => props.onCancel(item.id)}>
          {props.labels.cancel} {item.name}
        </Button>
      ) : null}
      {item.status === 'error' || item.status === 'canceled' ? (
        <Button variant="outline" size="sm" onClick={() => props.onRetry(item.id)}>
          {props.labels.retry} {item.name}
        </Button>
      ) : null}
      <label className="inline-flex h-7 cursor-pointer items-center rounded-lg border border-input px-2.5 text-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50">
        {props.labels.replace}
        <input
          type="file"
          className="sr-only"
          aria-label={`${props.labels.replace} ${item.name}`}
          disabled={pending}
          accept={props.limits.accept.join(',')}
          onChange={(event) => {
            const result = inspectFiles(Array.from(event.currentTarget.files ?? []), {
              ...props.limits,
              maxFiles: 1,
            });
            if (result.rejected.length > 0) props.onReject(result.rejected);
            const [file] = result.accepted;
            if (file) props.onReplace(item.id, file);
            event.currentTarget.value = '';
          }}
        />
      </label>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => props.onRemove(item.id)}>
        {props.labels.remove} {item.name}
      </Button>
    </div>
  );
}

function RemoteUrl({ props }: { props: UploadProps }) {
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const url = safeResourceUrl(value.trim());
        if (!url || url.startsWith('/')) {
          setInvalid(true);
          return;
        }
        setInvalid(false);
        props.onRemoteUrl(url);
      }}
    >
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label={props.labels.remoteUrl}
          placeholder={props.labels.remoteUrl}
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          aria-invalid={invalid || undefined}
          className="min-w-36 flex-1"
        />
        <Button type="submit" variant="outline">
          {props.labels.useUrl}
        </Button>
      </div>
      {invalid ? (
        <p role="alert" className="text-sm text-destructive">
          {props.labels.invalidUrl}
        </p>
      ) : null}
    </form>
  );
}

export function Upload(props: UploadProps) {
  const files = props.items.flatMap((item) => (item.file ? [item.file] : []));
  const previews = useFilePreviews(files);
  return (
    <section aria-label={props.labels.label} className="space-y-4">
      {!props.readOnly ? (
        <>
          <Dropzone
            limits={{
              ...props.limits,
              maxFiles: Math.max(0, props.limits.maxFiles - props.items.length),
            }}
            labels={props.dropzoneLabels}
            onFiles={props.onFiles}
            onReject={props.onReject}
          />
          <RemoteUrl props={props} />
        </>
      ) : null}
      <ul className="space-y-3">
        {props.items.map((item) => {
          const preview = item.file ? previews.get(item.file) : item.url;
          const progress = Number.isFinite(item.progress)
            ? Math.min(100, Math.max(0, item.progress))
            : 0;
          return (
            <li key={item.id} className="space-y-2">
              <FileDetails
                file={{ ...item, url: preview }}
                labels={props.fileLabels}
                formatBytes={props.formatBytes}
                formatDimensions={props.formatDimensions}
                actions={<UploadActions item={item} props={props} />}
              />
              <p role="status" className="text-sm text-muted-foreground">
                {props.labels.statuses[item.status]}
              </p>
              {item.status === 'uploading' || item.status === 'processing' ? (
                <progress
                  aria-label={`${props.labels.progress} ${item.name}`}
                  max={100}
                  value={progress}
                  className="h-2 w-full accent-primary"
                />
              ) : null}
              {item.status === 'error' && item.error ? (
                <p role="alert" className="text-sm text-destructive">
                  {item.error}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {props.customActions}
    </section>
  );
}
