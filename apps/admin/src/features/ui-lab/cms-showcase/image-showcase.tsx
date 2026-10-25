'use client';

import { useState } from 'react';
import { ImageAdjustments } from '../../../components/cms/image-adjustments';
import type { AppliedImageEdits, ImageEdits } from '../../../components/cms/image-adjustments';
import { PreviewSizes } from '../../../components/cms/upload-helpers';
import { useFilePreviews } from '../../../components/cms/file-previews';
import type { CmsCopy } from '../cms-messages';

function exampleImage(width: number, height: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 800 600"><rect width="800" height="600" fill="#e2e8f0"/><circle cx="600" cy="160" r="70" fill="#fbbf24"/><path d="M0 600V430L260 150L580 600Z" fill="#64748b"/><path d="M240 600L570 280L800 490V600Z" fill="#334155"/></svg>`;
  return new File([svg], `example-${width}x${height}.svg`, { type: 'image/svg+xml' });
}

export function ImageShowcase({
  copy,
  onDirtyChange,
}: {
  copy: CmsCopy;
  onDirtyChange(this: void, dirty: boolean): void;
}) {
  const [images] = useState(() => [
    { id: 'original', width: 800, height: 600, file: exampleImage(800, 600) },
    { id: 'thumbnail', width: 320, height: 240, file: exampleImage(320, 240) },
    { id: 'square', width: 240, height: 240, file: exampleImage(240, 240) },
  ]);
  const previews = useFilePreviews(images.map((image) => image.file));
  const [selected, setSelected] = useState('original');
  const [edits, setEdits] = useState<ImageEdits>({
    crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    focalPoint: { x: 0.5, y: 0.5 },
  });
  const [applied, setApplied] = useState<AppliedImageEdits | null>(null);
  const [original] = images;
  const url = original ? previews.get(original.file) : undefined;
  return (
    <div className="space-y-5">
      <PreviewSizes
        variants={images.map((image) => ({
          id: image.id,
          label:
            image.id === 'original'
              ? copy.original
              : image.id === 'thumbnail'
                ? copy.thumbnail
                : copy.square,
          file: {
            name: image.file.name,
            mimeType: image.file.type,
            size: image.file.size,
            width: image.width,
            height: image.height,
            url: previews.get(image.file),
          },
        }))}
        selectedId={selected}
        onChange={setSelected}
        label={copy.variant}
        labels={copy.file}
        formatBytes={copy.formatBytes}
        formatDimensions={copy.formatDimensions}
      />
      {url ? (
        <ImageAdjustments
          image={{ src: url, alt: copy.imageAlt, width: 800, height: 600 }}
          value={edits}
          labels={copy.image}
          onChange={(value) => {
            setEdits(value);
            onDirtyChange(true);
          }}
          onApply={(value) => {
            setApplied(value);
            onDirtyChange(false);
          }}
        />
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          {copy.file.unavailable}
        </p>
      )}
      {applied ? (
        <output
          aria-label={copy.applied}
          className="block overflow-x-auto rounded-lg bg-muted p-3 text-xs"
        >
          <pre>{JSON.stringify(applied, null, 2)}</pre>
        </output>
      ) : null}
    </div>
  );
}
