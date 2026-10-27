import { draftSettings } from '../collections/draft-config.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import type { CollectionDefinition } from '../definition.ts';

export function assertDocumentOperation(
  collection: CollectionDefinition,
  operationId: string,
): void {
  if (operationId === 'documents.copy' && collection.disableDuplicate) fail('forbidden');
  const drafts = draftSettings(collection);
  if (['documents.autosave', 'content.schedulePublication'].includes(operationId) && !drafts)
    fail('invalid_input');
  if (operationId === 'documents.autosave' && !drafts?.autosave) fail('forbidden');
  if (operationId === 'content.schedulePublication' && !drafts?.schedule) fail('forbidden');
}
export function assertBatchOperation(collection: CollectionDefinition, operationId: string): void {
  assertDocumentOperation(collection, operationId);
  if (
    collection.disableBulkEdit &&
    ['documents.update', 'documents.restoreTrash'].includes(operationId)
  )
    fail('forbidden');
  if (collection.disableBulkDelete && operationId === 'documents.archive') fail('forbidden');
}
export function operationControls(collection: CollectionDefinition) {
  return {
    disableBulkEdit: collection.disableBulkEdit === true,
    disableBulkDelete: collection.disableBulkDelete === true,
    disableDuplicate: collection.disableDuplicate === true,
  };
}
