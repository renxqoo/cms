import { z } from 'zod';
import type { CmsPolicy } from '@new-cms/cms/platform/contracts';

export const credentialGrantSchema = z
  .strictObject({
    operationId: z.string().min(1).max(128),
    scopeKind: z.enum(['global', 'collection']),
    collectionKey: z
      .string()
      .regex(/^[a-z][a-z0-9_-]{0,63}$/)
      .nullable(),
  })
  .refine((value) => (value.scopeKind === 'global') === (value.collectionKey === null));

export const bearerSchema = z.string().regex(/^[A-Za-z0-9_-]{43,256}$/);

export function credentialInputSchemas(policy: CmsPolicy) {
  const grants = z.array(credentialGrantSchema).min(1).max(policy.delegation.maxGrantOperations);
  const requestId = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
  return {
    'credentials.list': z.strictObject({
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(policy.maxPageSize).default(policy.defaultPageSize),
      kind: z.enum(['api_key', 'oauth']).optional(),
    }),
    'credentials.createKey': z.strictObject({
      name: z.string().trim().min(1).max(80),
      expiresAt: z.iso.datetime(),
      grants,
    }),
    'credentials.revoke': z.strictObject({ id: z.uuid() }),
    'credentials.revokeClient': z.strictObject({ clientId: z.string().min(1).max(128) }),
    'credentials.getAuthorization': z.strictObject({ requestId }),
    'credentials.decideAuthorization': z.strictObject({
      requestId,
      approved: z.boolean(),
      grants: z.array(credentialGrantSchema).max(policy.delegation.maxGrantOperations),
      name: z.string().trim().min(1).max(80).optional(),
    }),
  };
}
