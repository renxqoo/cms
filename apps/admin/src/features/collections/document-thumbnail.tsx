'use client';

import type { Collection } from '../../contracts/content';
import type { Document } from '../../contracts/documents';
import { PrivateThumbnail } from '../assets/private-file';

export function DocumentThumbnail(props: {
  collection: Collection;
  document: Document;
  locale: string;
  mode: 'editing' | 'published';
}) {
  const { collection, document, locale, mode } = props;
  const path = collection.admin?.useAsThumbnail;
  const binding = path
    ? document.mediaBindings?.find((candidate) => {
        const separator = candidate.sourcePath.indexOf(':');
        const language = separator < 0 ? null : candidate.sourcePath.slice(0, separator);
        const sourcePath =
          separator < 0 ? candidate.sourcePath : candidate.sourcePath.slice(separator + 1);
        return (
          (language === null || language === locale) &&
          (sourcePath === path || sourcePath.startsWith(`${path}.`))
        );
      })
    : undefined;
  const manifest = binding?.manifest ?? (collection.upload ? document.file : undefined);
  if (!manifest?.objects.some((object) => object.mimeType.startsWith('image/'))) return null;
  return (
    <PrivateThumbnail
      key={manifest.id}
      manifest={manifest}
      target={{
        collection: document.collection,
        id: document.id,
        versionId: document.versionId,
        locale,
        mode,
        fallback: [],
        ...(binding ? { bindingId: binding.bindingId } : {}),
      }}
    />
  );
}
