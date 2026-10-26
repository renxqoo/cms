import { createHash } from 'node:crypto';
import type { CmsPolicy, RequestContext } from '@new-cms/cms/platform/contracts';
import type { CredentialGrant } from '@new-cms/cms/identity';
import { createContentMediaFixture } from '../../../../../../test/support/content-media-runtime.ts';
import { contentContext, contentPassword } from '../../../../../../test/support/content-runtime.ts';

export function grant(operationId: string, collectionKey: string | null = null): CredentialGrant {
  return {
    operationId,
    scopeKind: collectionKey === null ? 'global' : 'collection',
    collectionKey,
  };
}

export const managementGrants = [
  grant('credentials.createKey'),
  grant('credentials.list'),
  grant('credentials.revoke'),
  grant('credentials.revokeClient'),
  grant('credentials.getAuthorization'),
  grant('credentials.decideAuthorization'),
  grant('documents.get', 'articles'),
];

export async function createDelegationWorld(delegation: Partial<CmsPolicy['delegation']> = {}) {
  const fixture = await createContentMediaFixture();
  Object.assign(fixture.policy.delegation, delegation);
  const config = {
    issuer: 'https://api.example.test',
    mcpResource: 'https://mcp.example.test/mcp',
    frontendUrl: 'https://admin.example.test',
    bridgeSecret: 'delegation-security-test-bridge-secret',
  };
  return { ...fixture, config, oauth: fixture.identity.oauth(config) };
}

export type DelegationWorld = Awaited<ReturnType<typeof createDelegationWorld>>;

export async function issueKey(
  world: DelegationWorld,
  input: {
    ctx?: RequestContext;
    name?: string;
    grants?: CredentialGrant[];
    expiresAt?: string;
  } = {},
) {
  const key = await world.access.api.createApiKey(input.ctx ?? world.owner(), {
    name: input.name ?? 'Security key',
    grants: input.grants ?? managementGrants,
    expiresAt: input.expiresAt ?? new Date(Date.now() + 3_600_000).toISOString(),
  });
  const access = await world.oauth.exchange(contentContext(), {
    token: key.apiKey,
    bridgeSecret: world.config.bridgeSecret,
  });
  return { ...key, token: access.access_token, ctx: () => contentContext(access.access_token) };
}

export async function secondOwner(world: DelegationWorld) {
  const principal = await world.access.api.me(world.owner(), {});
  const account = await world.database.transaction(async (tx) =>
    world.identity.participants.initializeAccount(tx, {
      email: 'second-owner@example.test',
      displayName: 'Second owner',
      roleId: principal.roleId,
      passwordHash: await world.identity.participants.preparePassword(contentPassword),
    }),
  );
  const login = await world.identity.api.login(contentContext(), {
    email: account.email,
    password: contentPassword,
  });
  return { account, ctx: () => contentContext(login.token) };
}

export async function authorizationCode(
  world: DelegationWorld,
  input: {
    clientId?: string;
    redirectUri?: string;
    ctx?: RequestContext;
    grants?: CredentialGrant[];
    name?: string;
  } = {},
) {
  const verifier = 's'.repeat(64);
  const clientId = input.clientId ?? 'cms-cli';
  const redirectUri = input.redirectUri ?? 'http://127.0.0.1:49368/callback';
  const request = await world.oauth.authorize(contentContext(), {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    scope: 'cms offline_access',
    state: 'security-state',
    resource: world.config.issuer,
  });
  const requestId = new URL(request.redirectTo).searchParams.get('request');
  if (!requestId) throw new Error('Expected a pending OAuth authorization request.');
  const decided = await world.access.api.decideAuthorization(input.ctx ?? world.owner(), {
    requestId,
    approved: true,
    grants: input.grants ?? managementGrants,
    ...(input.name ? { name: input.name } : {}),
  });
  const code = new URL(decided.redirectTo).searchParams.get('code');
  if (!code) throw new Error('Expected an OAuth authorization code.');
  return { code, clientId, verifier, redirectUri };
}

export function exchangeCode(
  world: DelegationWorld,
  request: Awaited<ReturnType<typeof authorizationCode>>,
) {
  return world.oauth.token(contentContext(), {
    grant_type: 'authorization_code',
    client_id: request.clientId,
    code: request.code,
    code_verifier: request.verifier,
    redirect_uri: request.redirectUri,
    resource: world.config.issuer,
  });
}

export const uploadGrants = [
  grant('documents.create', 'media'),
  grant('assets.createUpload', 'media'),
  grant('assets.writeUpload', 'media'),
  grant('assets.completeUpload', 'media'),
  grant('assets.readUpload', 'media'),
  grant('assets.cancelUpload', 'media'),
];

export const uploadBytes = new TextEncoder().encode('%PDF-1.7\nDelegated upload source\n%%EOF');

export function byteStream() {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(uploadBytes);
      controller.close();
    },
  });
}

export function beginUpload(kit: DelegationWorld, ctx: RequestContext) {
  return kit.assets.api.createUpload(ctx, {
    collection: 'media',
    purpose: 'create',
    filename: 'source.pdf',
    mimeType: 'application/pdf',
    bytes: uploadBytes.byteLength,
  });
}

export async function queueUpload(kit: DelegationWorld) {
  const source = await issueKey(kit, { name: 'Upload source A', grants: uploadGrants });
  const completer = await issueKey(kit, { name: 'Upload completer B', grants: uploadGrants });
  const upload = await beginUpload(kit, source.ctx());
  await kit.assets.api.writeUpload(
    source.ctx(),
    { collection: 'media', uploadId: upload.id },
    byteStream(),
  );
  const queued = await kit.assets.api.completeUpload(completer.ctx(), {
    collection: 'media',
    uploadId: upload.id,
  });
  return { source, completer, upload, queued };
}
