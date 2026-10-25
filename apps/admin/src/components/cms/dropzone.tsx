'use client';

import { useId, useState } from 'react';
import type { ClipboardEvent, DragEvent } from 'react';
import { UploadIcon } from 'lucide-react';
import { inspectFiles } from './file-intake';
import type { FileLimits, FileRejection } from './file-intake';

export interface DropzoneLabels {
  label: string;
  description: string;
  choose: string;
  count: string;
  size: string;
  type: string;
}

export interface DropzoneProps {
  limits: FileLimits;
  labels: DropzoneLabels;
  disabled?: boolean | undefined;
  onFiles(this: void, files: File[]): void;
  onReject(this: void, rejections: FileRejection[]): void;
}

export function Dropzone({ limits, labels, disabled, onFiles, onReject }: DropzoneProps) {
  const id = useId();
  const [dragging, setDragging] = useState(false);
  const [rejections, setRejections] = useState<FileRejection[]>([]);
  function receive(files: readonly File[]) {
    if (disabled) return;
    const result = inspectFiles(files, limits);
    setRejections(result.rejected);
    if (result.accepted.length > 0) onFiles(result.accepted);
    if (result.rejected.length > 0) onReject(result.rejected);
  }
  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    receive(Array.from(event.dataTransfer.files));
  }
  function paste(event: ClipboardEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(document.activeElement)) return;
    const files = Array.from(event.clipboardData.files);
    if (files.length > 0) {
      event.preventDefault();
      receive(files);
    }
  }
  return (
    <div className="space-y-2">
      <div
        role="group"
        aria-label={labels.label}
        aria-disabled={disabled ? true : undefined}
        tabIndex={disabled ? -1 : 0}
        data-dragging={dragging || undefined}
        className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-input p-5 text-center outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 data-[dragging=true]:border-ring data-[dragging=true]:bg-muted aria-disabled:opacity-50"
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (
            !(event.relatedTarget instanceof Node) ||
            !event.currentTarget.contains(event.relatedTarget)
          )
            setDragging(false);
        }}
        onDrop={drop}
        onPaste={paste}
      >
        <UploadIcon aria-hidden="true" className="size-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{labels.description}</p>
        <label
          htmlFor={id}
          className="inline-flex min-h-8 cursor-pointer items-center rounded-lg border border-input bg-background px-2.5 py-1 text-sm font-medium has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
        >
          {labels.choose}
          <input
            id={id}
            type="file"
            className="sr-only"
            disabled={disabled}
            accept={limits.accept.join(',')}
            multiple={limits.maxFiles > 1}
            onChange={(event) => {
              receive(Array.from(event.currentTarget.files ?? []));
              event.currentTarget.value = '';
            }}
          />
        </label>
      </div>
      {rejections.length > 0 ? (
        <ul role="alert" className="space-y-1 text-sm text-destructive">
          {rejections.map(({ file, reason }, index) => (
            <li key={`${file.name}-${index}`}>
              {file.name}: {labels[reason]}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export type { FileLimits, FileRejection } from './file-intake';
