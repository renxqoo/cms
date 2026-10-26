import type { ContentRuntime } from '../types.ts';
import type { ContentDeliveryOptions, MessageContract } from './types.ts';
function validateClientOrigin(origin: string): void {
  const target = new URL(origin);
  const local =
    target.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname);
  if (
    (!local && target.protocol !== 'https:') ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.pathname !== '/'
  )
    throw new Error('Invalid content client origin');
}
function validPreviousContract(contract: MessageContract): boolean {
  if (contract.availableUntil === null) return false;
  const expires = Date.parse(contract.availableUntil);
  return Number.isFinite(expires) && expires <= Date.now() + 86400000;
}
function validateContracts(contracts: readonly MessageContract[]): void {
  if (
    contracts.length === 0 ||
    contracts.length > 2 ||
    new Set(contracts.map(({ version }) => version)).size !== contracts.length ||
    contracts[0]?.availableUntil !== null ||
    contracts.some(
      (contract, index) =>
        !contract.version ||
        typeof contract.validate !== 'function' ||
        (index > 0 && !validPreviousContract(contract)),
    )
  )
    throw new Error('Invalid content message contracts');
}
export function validateDeliveryOptions(
  runtime: ContentRuntime,
  options: ContentDeliveryOptions,
): void {
  validateClientOrigin(options.clientOrigin);
  const { policy } = options;
  if (
    Object.values(policy).some((value) => !Number.isSafeInteger(value) || value <= 0) ||
    policy.previewTtlMs > 600000 ||
    policy.maxNavigationItems > runtime.limits.maxPageSize ||
    policy.maxRelatedItems > runtime.limits.maxPageSize ||
    policy.exportBatchSize > runtime.limits.maxPageSize
  )
    throw new Error('Invalid content delivery budgets');
  validateContracts(options.messageContracts);
}
