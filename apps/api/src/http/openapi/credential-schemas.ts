import { array, id, integer, object, page, text, time } from './schema.ts';
import type { Schema } from './schema.ts';

export function credentialResponseSchemas(): Record<string, Schema> {
  const grant = object({
    operationId: text,
    scopeKind: { enum: ['global', 'collection'] },
    collectionKey: { type: ['string', 'null'] },
  });
  const credential = object({
    id,
    kind: { enum: ['api_key', 'oauth'] },
    name: text,
    prefix: { type: ['string', 'null'] },
    clientId: { type: ['string', 'null'] },
    clientName: { type: ['string', 'null'] },
    resource: { enum: ['api', 'mcp'] },
    grants: array(grant),
    createdAt: time,
    expiresAt: time,
    revokedAt: { anyOf: [time, { type: 'null' }] },
    lastUsedAt: { anyOf: [time, { type: 'null' }] },
    status: { enum: ['active', 'expired', 'revoked'] },
  });
  return {
    Credential: credential,
    CredentialPage: page('Credential'),
    ApiKeyCreated: object({ credential, apiKey: text }),
    ClientGrantsRevoked: object({ revoked: integer }),
    OAuthAuthorizationRequest: object({
      id: text,
      clientId: text,
      clientName: text,
      redirectUri: { type: 'string', format: 'uri' },
      resource: { type: 'string', format: 'uri' },
      scopes: array(text),
      expiresAt: time,
      availableGrants: array(grant),
    }),
    OAuthAuthorizationDecision: object({ redirectTo: { type: 'string', format: 'uri' } }),
  };
}
