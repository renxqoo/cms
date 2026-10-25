'use client';

import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Upload } from '../../../components/cms/upload';
import type { UploadItem } from '../../../components/cms/upload';
import type { CmsCopy } from '../cms-messages';

export function UploadShowcase({
  copy,
  onDirtyChange,
}: {
  copy: CmsCopy;
  onDirtyChange(this: void, dirty: boolean): void;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [event, setEvent] = useState('');
  return (
    <div className="space-y-4">
      <Upload
        items={items}
        limits={{ maxFiles: 5, maxBytes: 5 * 1024 * 1024, accept: ['image/*', 'text/plain'] }}
        labels={copy.upload}
        dropzoneLabels={copy.dropzone}
        fileLabels={copy.file}
        formatBytes={copy.formatBytes}
        formatDimensions={copy.formatDimensions}
        onFiles={(files) => {
          setItems((current) => [
            ...current,
            ...files.map((file) => ({
              id: crypto.randomUUID(),
              name: file.name,
              size: file.size,
              mimeType: file.type,
              file,
              progress: 0,
              status: 'queued' as const,
            })),
          ]);
          setEvent(copy.readyHint);
          onDirtyChange(true);
        }}
        onReject={(rejections) =>
          setEvent(
            rejections
              .map(({ file, reason }) => `${file.name}: ${copy.dropzone[reason]}`)
              .join(', '),
          )
        }
        onRemoteUrl={(url) => setEvent(`${copy.upload.useUrl}: ${url}`)}
        onCancel={(id) =>
          setItems((current) =>
            current.map((item) => (item.id === id ? { ...item, status: 'canceled' } : item)),
          )
        }
        onRetry={(id) =>
          setItems((current) =>
            current.map((item) =>
              item.id === id ? { ...item, status: 'queued', progress: 0 } : item,
            ),
          )
        }
        onReplace={(id, file) => {
          setItems((current) =>
            current.map((item) =>
              item.id === id
                ? {
                    ...item,
                    name: file.name,
                    size: file.size,
                    mimeType: file.type,
                    file,
                    status: 'queued',
                    progress: 0,
                  }
                : item,
            ),
          );
          onDirtyChange(true);
        }}
        onRemove={(id) => {
          const next = items.filter((item) => item.id !== id);
          setItems(next);
          onDirtyChange(next.length > 0);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={items.length === 0}
          onClick={() =>
            setItems((current) =>
              current.map((item, index) => ({
                ...item,
                status: index % 2 === 0 ? 'uploading' : 'processing',
                progress: index % 2 === 0 ? 45 : 75,
              })),
            )
          }
        >
          {copy.progressExample}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setItems([]);
            setEvent('');
            onDirtyChange(false);
          }}
        >
          {copy.reset}
        </Button>
      </div>
      {event ? (
        <output aria-label={copy.event} className="block break-all text-sm text-muted-foreground">
          {event}
        </output>
      ) : null}
    </div>
  );
}
