import { z } from 'zod';
import { fail } from '@new-cms/cms/platform/contracts';

export const emailSchema = z.string().trim().toLowerCase().max(255).email();
export const displayNameSchema = z.string().min(1).max(64).nullable();
const passwordValue = z
  .string()
  .refine((value) => Array.from(value).length <= 128 && Buffer.byteLength(value, 'utf8') <= 512);
export const newPasswordSchema = passwordValue.refine((value) => Array.from(value).length >= 15);
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const loginSchema = z.strictObject({ email: emailSchema, password: passwordValue.min(1) });
export const resetRequestSchema = z.strictObject({ email: emailSchema });
export const consumeTokenSchema = z.strictObject({
  token: tokenSchema,
  newPassword: newPasswordSchema,
});
export const changePasswordSchema = z.strictObject({
  currentPassword: passwordValue.min(1),
  newPassword: newPasswordSchema,
});
export const identityInputSchemas = {
  'identity.login': loginSchema,
  'identity.logout': z.strictObject({}),
  'identity.changePassword': changePasswordSchema,
  'identity.acceptInvitation': consumeTokenSchema,
  'identity.requestPasswordReset': resetRequestSchema,
  'identity.resetPassword': consumeTokenSchema,
};
export const createAccountSchema = z.strictObject({
  email: emailSchema,
  displayName: displayNameSchema,
  roleId: z.uuid(),
});
export const updateAccountSchema = z
  .strictObject({
    id: z.uuid(),
    version: z.number().int().positive(),
    displayName: displayNameSchema.optional(),
    roleId: z.uuid().optional(),
    status: z.enum(['active', 'disabled', 'archived']).optional(),
  })
  .refine((value) => Object.keys(value).length > 2);

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) fail('invalid_input');
  return parsed.data;
}

export function checkedToken(value: unknown): string {
  const parsed = tokenSchema.safeParse(value);
  if (!parsed.success) fail('unauthenticated');
  return parsed.data;
}
