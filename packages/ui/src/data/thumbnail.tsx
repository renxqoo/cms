'use client';

import {
  FileArchiveIcon,
  FileAudioIcon,
  FileIcon,
  FileImageIcon,
  FileTextIcon,
  FileVideoIcon,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '../cn.ts';
import { safeHref } from '../navigation/safe-url.ts';

export interface ThumbnailProps {
  src?: string | null;
  alt: string;
  filename: string;
  fallbackLabel: string;
  mimeType?: string;
  className?: string;
}

function FileThumbnailIcon({ mimeType }: { mimeType: string | undefined }) {
  if (mimeType?.startsWith('image/')) return <FileImageIcon />;
  if (mimeType?.startsWith('video/')) return <FileVideoIcon />;
  if (mimeType?.startsWith('audio/')) return <FileAudioIcon />;
  if (mimeType?.startsWith('text/') || mimeType === 'application/pdf') return <FileTextIcon />;
  if (mimeType?.includes('zip') || mimeType?.includes('compressed')) return <FileArchiveIcon />;
  return <FileIcon />;
}

export function Thumbnail({
  src,
  alt,
  filename,
  fallbackLabel,
  mimeType,
  className,
}: ThumbnailProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const safe = safeHref(src, true);
  const classes = cn(
    'flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted text-muted-foreground',
    className,
  );
  if (safe && safe !== failed)
    return (
      <img
        src={safe}
        alt={alt}
        title={filename}
        loading="lazy"
        className={cn(classes, 'object-cover')}
        onError={() => setFailed(safe)}
      />
    );
  return (
    <span role="img" aria-label={fallbackLabel} title={filename} className={classes}>
      <span aria-hidden="true" className="[&_svg]:size-5">
        <FileThumbnailIcon mimeType={mimeType} />
      </span>
    </span>
  );
}
