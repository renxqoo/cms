import type { SqlExecutor } from '@new-cms/database/client';
import type { IdentityDependencies } from './runtime.ts';
import type { DeliveryExecutor } from './delivery-executor.ts';
import type {
  CreateAccountInput,
  IdentityParticipants,
  InitializeAccountInput,
  UpdateAccountInput,
} from './types.ts';
import { listAccounts } from './account-list.ts';
import { findAccount, insertAccount, updateAccountRow } from './adapters/postgres/accounts.ts';
import { writeCredential } from './adapters/postgres/credentials.ts';
import { authenticate } from './adapters/postgres/sessions.ts';
import { findDelivery } from './adapters/postgres/deliveries.ts';
import { issueInvitation } from './invitations.ts';
import {
  createAccountSchema,
  newPasswordSchema,
  parseInput,
  updateAccountSchema,
} from './validation.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import { createDelegations } from './delegations/participants.ts';

async function createAccount(tx: SqlExecutor, input: CreateAccountInput) {
  try {
    return await insertAccount(tx, parseInput(createAccountSchema, input));
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505')
      fail('identifier_taken');
    throw error;
  }
}

async function initializeAccount(tx: SqlExecutor, input: InitializeAccountInput) {
  const account = await createAccount(tx, {
    email: input.email,
    displayName: input.displayName,
    roleId: input.roleId,
  });
  await writeCredential(tx, { adminId: account.id, hash: input.passwordHash });
  const activated = await findAccount(tx, account.id);
  if (!activated) fail('internal_error');
  return activated;
}

async function updateAccount(tx: SqlExecutor, input: UpdateAccountInput) {
  const parsed = parseInput(updateAccountSchema, input);
  return await updateAccountRow(tx, {
    id: parsed.id,
    version: parsed.version,
    ...(parsed.displayName !== undefined ? { displayName: parsed.displayName } : {}),
    ...(parsed.roleId !== undefined ? { roleId: parsed.roleId } : {}),
    ...(parsed.status !== undefined ? { status: parsed.status } : {}),
  });
}

export function createParticipants(
  deps: IdentityDependencies,
  executor: DeliveryExecutor,
): IdentityParticipants {
  return {
    delegations: createDelegations(deps),
    authenticate: (tx, ctx) => authenticate(tx, ctx, deps.policy),
    account: findAccount,
    delivery: findDelivery,
    listAccounts: (tx, input) => listAccounts(tx, input, deps.policy),
    createAccount,
    updateAccount,
    issueInvitation: (tx, adminId, ctx) =>
      issueInvitation(tx, { policy: deps.policy, executor }, { adminId, ctx }),
    preparePassword: async (password, signal) =>
      await deps.passwords.hash(parseInput(newPasswordSchema, password), signal),
    initializeAccount,
  };
}
