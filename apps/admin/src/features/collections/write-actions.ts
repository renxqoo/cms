import type { OperationId } from '../../contracts/operations';
import { getOperation } from '../../contracts/operations';

export type WriteAction =
  | 'save'
  | 'autosave'
  | 'publish'
  | 'unpublish'
  | 'copy'
  | 'archive'
  | 'restore';
const operations: Record<WriteAction, OperationId> = {
  save: 'documents.update',
  autosave: 'documents.autosave',
  publish: 'documents.publish',
  unpublish: 'documents.unpublish',
  copy: 'documents.copy',
  archive: 'documents.archive',
  restore: 'versions.restore',
};
export function writeOperation(action: WriteAction, creating: boolean): OperationId {
  return creating ? 'documents.create' : operations[action];
}
export function writeReplayable(action: WriteAction, creating: boolean): boolean {
  return getOperation(writeOperation(action, creating)).idempotency === 'required';
}
