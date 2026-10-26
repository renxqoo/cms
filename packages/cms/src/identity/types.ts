import type { RequestContext } from '@new-cms/cms/platform/contracts';
import type { SqlExecutor } from '@new-cms/database/client';
import type { DelegationParticipants } from './delegations/participants.ts';

export type AccountStatus = 'active' | 'disabled' | 'archived';
export type DeliveryStatus = 'pending' | 'sending' | 'accepted' | 'failed' | 'unknown';
export type TokenPurpose = 'invitation' | 'password_reset';

export interface Delivery {
  id: string;
  status: DeliveryStatus;
  createdAt: string;
  finishedAt: string | null;
}

export interface Account {
  id: string;
  email: string;
  displayName: string | null;
  roleId: string;
  status: AccountStatus;
  version: number;
  activation: 'pending' | 'activated';
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  invitationDelivery: Delivery | null;
}

export interface AccountPage {
  rows: Account[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateAccountInput {
  email: string;
  displayName: string | null;
  roleId: string;
}

export interface UpdateAccountInput {
  id: string;
  version: number;
  displayName?: string | null;
  roleId?: string;
  status?: AccountStatus;
}

export interface InitializeAccountInput extends CreateAccountInput {
  passwordHash: string;
}

export interface InvitationIssue {
  delivery: Pick<Delivery, 'id' | 'status'>;
  dispatch(): void;
}

export interface IdentityParticipants {
  delegations: DelegationParticipants;
  authenticate(tx: SqlExecutor, ctx: RequestContext): Promise<Account>;
  account(tx: SqlExecutor, id: string): Promise<Account | null>;
  delivery(tx: SqlExecutor, id: string): Promise<Delivery | null>;
  listAccounts(tx: SqlExecutor, input: unknown): Promise<AccountPage>;
  createAccount(tx: SqlExecutor, input: CreateAccountInput): Promise<Account>;
  updateAccount(tx: SqlExecutor, input: UpdateAccountInput): Promise<Account>;
  issueInvitation(tx: SqlExecutor, adminId: string, ctx: RequestContext): Promise<InvitationIssue>;
  preparePassword(password: unknown, signal?: AbortSignal): Promise<string>;
  initializeAccount(tx: SqlExecutor, input: InitializeAccountInput): Promise<Account>;
}

export interface PasswordHasher {
  hash(password: string, signal?: AbortSignal): Promise<string>;
  verify(password: string, hash: string | null, signal?: AbortSignal): Promise<boolean>;
  close(): Promise<void>;
}

export interface MailMessage {
  to: string;
  purpose: TokenPurpose;
  token: string;
  signal: AbortSignal;
}

export interface Mailer {
  send(message: MailMessage): Promise<'accepted' | 'rejected' | 'unknown'>;
  close(): Promise<void>;
}

export interface LoginResult {
  token: string;
  tokenType: 'Bearer';
  expiresAt: string;
}

export interface IdentityApi {
  login(ctx: RequestContext, input: unknown): Promise<LoginResult>;
  logout(ctx: RequestContext, input?: unknown): Promise<void>;
  changePassword(ctx: RequestContext, input: unknown): Promise<void>;
  acceptInvitation(ctx: RequestContext, input: unknown): Promise<void>;
  requestPasswordReset(ctx: RequestContext, input: unknown): Promise<{ accepted: true }>;
  resetPassword(ctx: RequestContext, input: unknown): Promise<void>;
}
