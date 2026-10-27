import type { ContentApi } from '@new-cms/cms/content';
import type { BusinessHandler } from './handlers.ts';

export function contentHandlers(api: ContentApi): Map<string, BusinessHandler> {
  return new Map<string, BusinessHandler>([
    ['languages.setDefault', api.setDefaultLanguage],
    ['collections.list', api.listCollections],
    ['documents.order', api.getDocumentOrder],
    ['documents.reorder', api.reorderDocuments],
    ['documents.join', api.getJoinedDocuments],
    ['documents.reorderJoin', api.reorderJoinedDocuments],
    ...queryPresetHandlers(api),
    ['collections.get', api.getCollection],
    ['collections.editor', api.getEditor],
    ['collections.fieldOptions', api.getFieldOptions],
    ['hierarchy.tree', api.readHierarchy],
    ['hierarchy.move', api.moveHierarchy],
    ['documents.getLock', api.getEditorLease],
    ['documents.acquireLock', api.acquireEditorLease],
    ['documents.releaseLock', api.releaseEditorLease],
    ['documents.unlock', api.unlockDocument],
    ['documents.preview', api.getDocumentPreview],
    ['collections.previewEditor', api.previewEditor],
    ...documentHandlers(api),
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

function queryPresetHandlers(api: ContentApi): [string, BusinessHandler][] {
  return [
    ['queryPresets.list', api.listQueryPresets],
    ['queryPresets.preview', api.previewQueryPreset],
    ['queryPresets.fieldOptions', api.queryPresetFieldOptions],
    ['queryPresets.create', api.createQueryPreset],
    ['queryPresets.update', api.updateQueryPreset],
    ['queryPresets.share', api.shareQueryPreset],
    ['queryPresets.delete', api.deleteQueryPreset],
  ];
}

function documentHandlers(api: ContentApi): [string, BusinessHandler][] {
  return [
    ['documents.list', api.listDocuments],
    ['documents.distinct', api.distinctDocuments],
    ['documents.groups', api.groupDocuments],
    ['documents.create', api.createDocument],
    ['documents.validate', api.validateDocument],
    ['documents.get', api.getDocument],
    ['documents.update', api.updateDocument],
    ['documents.archive', api.archiveDocument],
    ['documents.copy', api.copyDocument],
    ['documents.copyLocale', api.copyLocale],
    ['documents.renameFile', api.renameFile],
    ['documents.restoreTrash', api.restoreTrashedDocument],
    ['documents.purge', api.purgeDocument],
    ['documents.autosave', api.autosaveDocument],
    ['documents.publish', api.publishDocument],
    ['documents.unpublish', api.unpublishDocument],
  ];
}
