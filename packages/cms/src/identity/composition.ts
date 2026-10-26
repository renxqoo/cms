import { createParticipants } from './account-participants.ts';
import { createDeliveryExecutor } from './delivery-executor.ts';
import { maintainIdentity } from './maintenance.ts';
import { changePassword, consumePasswordToken } from './password-actions.ts';
import { requestReset } from './reset-requests.ts';
import { login, logout } from './session-actions.ts';
import type { IdentityDependencies } from './runtime.ts';
import type { IdentityApi } from './types.ts';
import { createOAuth } from './delegations/oauth.ts';
import type { OAuthConfiguration } from './delegations/types.ts';

export type { IdentityDependencies } from './runtime.ts';
export type { OAuthConfiguration } from './delegations/types.ts';
export type {
  Account,
  AccountPage,
  CreateAccountInput,
  UpdateAccountInput,
  InitializeAccountInput,
  IdentityParticipants,
  PasswordHasher,
  Mailer,
  MailMessage,
  TokenPurpose,
} from './types.ts';

export function createIdentity(deps: IdentityDependencies) {
  const executor = createDeliveryExecutor(deps);
  const participants = createParticipants(deps, executor);
  const api: IdentityApi = {
    login: (ctx, input) => login(deps, ctx, input),
    logout: (ctx, input) => logout(deps, ctx, input),
    changePassword: (ctx, input) => changePassword(deps, ctx, input),
    acceptInvitation: (ctx, input) =>
      consumePasswordToken(deps, ctx, { purpose: 'invitation', value: input }),
    requestPasswordReset: (ctx, input) => requestReset(deps, ctx, { value: input, executor }),
    resetPassword: (ctx, input) =>
      consumePasswordToken(deps, ctx, { purpose: 'password_reset', value: input }),
  };
  async function close(): Promise<void> {
    await executor.close();
    await deps.mailer.close();
    await deps.passwords.close();
  }
  return {
    api,
    oauth: (configuration: OAuthConfiguration) => createOAuth(deps, configuration),
    participants,
    maintenance: () => maintainIdentity(deps.database, deps.policy),
    close,
  };
}
