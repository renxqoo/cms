import type { CredentialGrant } from '@new-cms/cms/identity';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { fail } from '@new-cms/cms/platform/contracts';
import { createRunner, auditChange } from './runtime.ts';
import type { AccessRuntime, AuthorizedWork } from './types.ts';
import { parse } from './validation.ts';
import { effectiveOperations } from './effective-operations.ts';

function management(state: AuthorizedWork) {
  return { adminId: state.actor.id, delegationId: state.actor.delegation?.id ?? null };
}

async function validateRequested(
  runtime: AccessRuntime,
  state: AuthorizedWork,
  grants: CredentialGrant[],
) {
  const available = await effectiveOperations(runtime, state.tx, state.actor);
  const keys = new Set(
    available.map((grant) =>
      JSON.stringify([grant.operationId, grant.scopeKind, grant.collectionKey]),
    ),
  );
  const selected = grants.map((grant) =>
    JSON.stringify([grant.operationId, grant.scopeKind, grant.collectionKey]),
  );
  if (new Set(selected).size !== selected.length || selected.some((key) => !keys.has(key)))
    fail('forbidden');
}

function list(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'credentials.list', mode: 'shared' },
    async (state) => {
      const values = parse(runtime.schemas['credentials.list'], input);
      return runtime.identity.delegations.list(state.tx, { ...management(state), ...values });
    },
  );
}

function createKey(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'credentials.createKey', mode: 'exclusive' },
    async (state) => {
      const values = parse(runtime.schemas['credentials.createKey'], input);
      await validateRequested(runtime, state, values.grants);
      const result = await runtime.identity.delegations.create(state.tx, {
        ...values,
        adminId: state.actor.id,
        parentId: state.actor.delegation?.id ?? null,
        kind: 'api_key',
        resource: 'mcp',
        clientId: null,
      });
      await auditChange(
        state,
        {
          operationId: 'credentials.createKey',
          targetType: 'credential',
          targetId: result.credential.id,
          detail: { resource: 'mcp', grantCount: values.grants.length },
        },
        runtime,
      );
      if (!result.apiKey) fail('internal_error');
      return { credential: result.credential, apiKey: result.apiKey };
    },
  );
}

function revoke(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'credentials.revoke', mode: 'exclusive' },
    async (state) => {
      const values = parse(runtime.schemas['credentials.revoke'], input);
      await runtime.identity.delegations.managed(state.tx, { ...management(state), id: values.id });
      const changed = await runtime.identity.delegations.revoke(state.tx, values.id);
      if (changed)
        await auditChange(
          state,
          {
            operationId: 'credentials.revoke',
            targetType: 'credential',
            targetId: values.id,
            detail: { revoked: changed },
          },
          runtime,
        );
    },
  );
}

function revokeClient(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'credentials.revokeClient', mode: 'exclusive' },
    async (state) => {
      const values = parse(runtime.schemas['credentials.revokeClient'], input);
      const revoked = await runtime.identity.delegations.revokeClient(state.tx, {
        ...management(state),
        clientId: values.clientId,
      });
      if (revoked)
        await auditChange(
          state,
          {
            operationId: 'credentials.revokeClient',
            targetType: 'oauth_client',
            targetId: values.clientId,
            detail: { revoked },
          },
          runtime,
        );
      return { revoked };
    },
  );
}

function authorization(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'credentials.getAuthorization', mode: 'shared' },
    async (state) => {
      const { requestId } = parse(runtime.schemas['credentials.getAuthorization'], input);
      const request = await runtime.identity.delegations.readAuthorization(state.tx, requestId);
      if (request.status !== 'pending') fail('token_invalid');
      const availableGrants = await effectiveOperations(runtime, state.tx, state.actor);
      if (availableGrants.length > runtime.policy.delegation.maxGrantOperations)
        fail('capacity_exceeded');
      return {
        id: request.id,
        clientId: request.client_id,
        clientName: request.client_name,
        redirectUri: request.redirect_uri,
        resource: request.resource_uri,
        scopes: request.scopes,
        expiresAt: request.expires_at.toISOString(),
        availableGrants,
      };
    },
  );
}

function decide(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'credentials.decideAuthorization', mode: 'exclusive' },
    async (state) => {
      const values = parse(runtime.schemas['credentials.decideAuthorization'], input);
      const request = await runtime.identity.delegations.readAuthorization(
        state.tx,
        values.requestId,
      );
      if (values.approved) {
        if (values.grants.length === 0) fail('invalid_input');
        await validateRequested(runtime, state, values.grants);
      }
      const result = await runtime.identity.delegations.decideAuthorization(state.tx, {
        request,
        approved: values.approved,
        adminId: state.actor.id,
        parentId: state.actor.delegation?.id ?? null,
        grants: values.grants,
        ...(values.name === undefined ? {} : { name: values.name }),
      });
      await auditChange(
        state,
        {
          operationId: 'credentials.decideAuthorization',
          targetType: 'oauth_client',
          targetId: request.client_id,
          detail: {
            approved: values.approved,
            resource: request.resource,
            grantCount: values.grants.length,
          },
        },
        runtime,
      );
      return result;
    },
  );
}

export function createCredentialsApi(runtime: AccessRuntime) {
  return {
    listCredentials: (ctx: RequestContext, input: unknown) => list(runtime, ctx, input),
    createApiKey: (ctx: RequestContext, input: unknown) => createKey(runtime, ctx, input),
    revokeCredential: (ctx: RequestContext, input: unknown) => revoke(runtime, ctx, input),
    revokeClientGrants: (ctx: RequestContext, input: unknown) => revokeClient(runtime, ctx, input),
    getAuthorization: (ctx: RequestContext, input: unknown) => authorization(runtime, ctx, input),
    decideAuthorization: (ctx: RequestContext, input: unknown) => decide(runtime, ctx, input),
  };
}
