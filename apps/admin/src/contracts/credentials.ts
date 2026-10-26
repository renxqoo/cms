import { z } from 'zod';
import { pageSchema } from './access';
import { allowedOperationSchema } from './auth';

export const credentialGrantSchema = allowedOperationSchema.refine((grant) =>
  grant.scopeKind === 'global' ? grant.collectionKey === null : Boolean(grant.collectionKey),
);

export const credentialSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['api_key', 'oauth']),
  name: z.string(),
  prefix: z.string().nullable(),
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  resource: z.enum(['api', 'mcp']),
  grants: z.array(credentialGrantSchema),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
  lastUsedAt: z.iso.datetime().nullable(),
  status: z.enum(['active', 'expired', 'revoked']),
});

export const credentialListSchema = pageSchema(credentialSchema);
export const keyCreatedSchema = z.object({
  credential: credentialSchema,
  apiKey: z.string().min(1),
});
export const clientRevocationSchema = z.object({ revoked: z.number().int().nonnegative() });
export const authorizationRequestSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  redirectUri: z.url(),
  resource: z.url(),
  scopes: z.array(z.string()),
  expiresAt: z.iso.datetime(),
  availableGrants: z.array(credentialGrantSchema),
});
export const authorizationDecisionSchema = z.object({ redirectTo: z.string() });

export type CredentialGrant = z.infer<typeof credentialGrantSchema>;
export type Credential = z.infer<typeof credentialSchema>;
export type AuthorizationRequest = z.infer<typeof authorizationRequestSchema>;
