import type { AllowedOperation } from '../../contracts/auth';

export function operationKey(operation: AllowedOperation): string {
  if (operation.scopeKind === 'global' && operation.collectionKey !== null) return '';
  if (operation.scopeKind === 'collection' && !operation.collectionKey) return '';
  return JSON.stringify([operation.operationId, operation.scopeKind, operation.collectionKey]);
}
