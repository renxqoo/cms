import type { Account } from '../types.ts';
import type { Scope } from '@new-cms/cms/platform/contracts';

export interface CredentialGrant extends Scope {
  operationId: string;
}

export interface Credential {
  id: string;
  kind: 'api_key' | 'oauth';
  name: string;
  prefix: string | null;
  clientId: string | null;
  clientName: string | null;
  resource: 'api' | 'mcp';
  grants: CredentialGrant[];
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  status: 'active' | 'expired' | 'revoked';
}

export interface GrantRow {
  id: string;
  admin_id: string;
  parent_id: string | null;
  kind: Credential['kind'];
  name: string;
  prefix: string | null;
  client_id: string | null;
  client_name: string | null;
  resource: Credential['resource'];
  grants: unknown;
  depth: number;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  last_used_at: Date | null;
  active: boolean;
}

export interface Authentication {
  account: Account;
  delegation: GrantRow | null;
}

export interface CreateGrant {
  adminId: string;
  parentId: string | null;
  kind: Credential['kind'];
  name: string;
  resource: Credential['resource'];
  clientId: string | null;
  expiresAt: string;
  grants: CredentialGrant[];
}

export interface OAuthConfiguration {
  issuer: string;
  mcpResource: string;
  frontendUrl: string;
  bridgeSecret: string;
}

export interface OAuthClient {
  id: string;
  name: string;
  redirectUris: string[];
  native: boolean;
  grantTypes: string[];
  scopes: string[];
}

export interface AuthorizationRequest {
  id: string;
  client_id: string;
  client_name: string;
  redirect_uri: string;
  issuer: string;
  resource_uri: string;
  resource: Credential['resource'];
  scopes: string[];
  state: string | null;
  code_challenge: string;
  status: 'pending' | 'approved' | 'denied' | 'consumed';
  grant_id: string | null;
  expires_at: Date;
  active: boolean;
}

export interface TokenResult {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  scope: string;
  refresh_token?: string;
}
