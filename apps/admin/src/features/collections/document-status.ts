import type { Collection } from '../../contracts/content';
import type { Document } from '../../contracts/documents';
import type { ContentMessages } from './messages';

export function documentStatus(
  document: Document,
  collection: Collection,
  presentation: { t: ContentMessages; mode?: string },
) {
  const { t, mode = 'editing' } = presentation;
  if (document.trashedAt) return { label: t.trash, tone: 'neutral' as const };
  if (collection.mode === 'direct') return { label: t.effective, tone: 'success' as const };
  if (mode === 'published') return { label: t.publishedSnapshot, tone: 'success' as const };
  if (!document.publishedVersionId) return { label: t.draft, tone: 'neutral' as const };
  if (document.versionId !== document.publishedVersionId)
    return { label: t.unpublishedChanges, tone: 'warning' as const };
  return { label: t.publishedStatus, tone: 'success' as const };
}
