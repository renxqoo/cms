import { expect, it } from 'vitest';
import { z } from 'zod';
import { newPasswordSchema } from '@new-cms/cms/identity';
import { CmsError } from '@new-cms/cms/platform/contracts';
import { initializationFailure } from '../initialization-error.ts';
import { PasswordInputError } from '../read-password.ts';

it('explains the password boundary enforced by the shared business schema', () => {
  for (const password of ['', 'a'.repeat(14), 'a'.repeat(129)]) {
    const result = z.object({ password: newPasswordSchema }).safeParse({ password });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('Expected invalid password');
    const message = initializationFailure(result.error);
    expect(message).toContain('15–128');
    expect(message).toContain('512');
    expect(message).not.toContain('a'.repeat(14));
  }
  for (const password of ['a'.repeat(15), 'a'.repeat(128), '界'.repeat(15), ' '.repeat(15)]) {
    expect(newPasswordSchema.parse(password)).toBe(password);
  }
});

it.each([
  ['protected_resource', 'super administrator already exists'],
  ['identifier_taken', 'email address is already in use'],
  ['invalid_input', '--email and --name'],
  ['temporarily_unavailable', 'db:migrate and operations:reconcile'],
] as const)(
  'explains known initialization failure %s without exposing details',
  (code, expected) => {
    const message = initializationFailure(
      new CmsError(code, { fieldErrors: [{ field: 'password', message: 'private-secret-value' }] }),
    );
    expect(message).toContain(expected);
    expect(message).not.toContain('private-secret-value');
  },
);

it('does not print raw environment errors or unexpected provider exception messages', () => {
  const invalidEnvironment = z.object({ DATABASE_URL: z.url() }).safeParse({
    DATABASE_URL: 'postgresql://owner:private-secret-value@[',
  });
  const configMessage = initializationFailure(invalidEnvironment.error);
  expect(configMessage).toContain('.env.example');
  expect(configMessage).not.toContain('private-secret-value');
  for (const error of [new Error('private-secret-value'), new CmsError('internal_error')]) {
    const message = initializationFailure(error);
    expect(message).toContain('Verify database configuration');
    expect(message).not.toContain('private-secret-value');
  }
});

it.each([
  ['cancelled', 'Password input cancelled'],
  ['too_long', '15–128'],
  ['invalid_input', 'Invalid password input'],
] as const)('explains password input failure %s using safe text', (code, expected) => {
  const message = initializationFailure(new PasswordInputError(code));
  expect(message).toContain(expected);
  expect(message).not.toContain('database');
});
