import type { ContentApi } from '@new-cms/cms/content';
import type { BusinessHandler } from './handlers.ts';

export function contentHandlers(api: ContentApi): Map<string, BusinessHandler> {
  return new Map<string, BusinessHandler>([
    ['collections.list', api.listCollections],
    ['collections.get', api.getCollection],
    ['collections.editor', api.getEditor],
    ['documents.list', api.listDocuments],
    ['documents.create', api.createDocument],
    ['documents.get', api.getDocument],
    ['documents.update', api.updateDocument],
    ['documents.archive', api.archiveDocument],
    ['documents.copy', api.copyDocument],
    ['documents.restoreTrash', api.restoreTrashedDocument],
    ['documents.purge', api.purgeDocument],
    ['documents.autosave', api.autosaveDocument],
    ['documents.publish', api.publishDocument],
    ['documents.unpublish', api.unpublishDocument],
    ['versions.list', api.listVersions],
    ['versions.get', api.getVersion],
    ['versions.restore', api.restoreVersion],
    ['versions.diff', api.compareVersions],
    ['content.schedulePublication', api.schedulePublication],
    ['content.cancelPublicationSchedule', api.cancelPublicationSchedule],
    ['content.batch', api.createBatch],
    ['content.getJob', api.getJob],
    ['content.listJobs', api.listJobs],
    ['assets.listUploads', api.listUploads],
    ['folders.list', api.listFolders],
    ['folders.create', api.createFolder],
    ['folders.update', api.updateFolder],
    ['folders.delete', api.deleteFolder],
    ['resources.list', api.listResources],
    ['resources.references', api.listReferences],
  ]);
}
