import { z } from 'zod';

export const authEmailSchema = z.string().trim().toLowerCase().max(255).email();

export interface LoginValues {
  email: string;
  password: string;
}

export interface LoginInputErrors {
  email?: 'emailRequired' | 'emailInvalid' | 'fieldInvalid' | undefined;
  password?: 'passwordRequired' | 'passwordTooLong' | 'fieldInvalid' | undefined;
}

export function validateLogin(
  values: LoginValues,
): { ok: true; values: LoginValues } | { ok: false; errors: LoginInputErrors } {
  const email = authEmailSchema.safeParse(values.email);
  const errors: LoginInputErrors = {};
  if (!email.success) errors.email = values.email.trim() ? 'emailInvalid' : 'emailRequired';
  if (values.password.length === 0) errors.password = 'passwordRequired';
  else if (
    Array.from(values.password).length > 128 ||
    new TextEncoder().encode(values.password).byteLength > 512
  )
    errors.password = 'passwordTooLong';
  if (!email.success || errors.password) return { ok: false, errors };
  return { ok: true, values: { email: email.data, password: values.password } };
}
