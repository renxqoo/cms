import { z } from 'zod';
import { CmsError } from '@new-cms/cms/platform/contracts';
import { PasswordInputError } from './read-password.ts';

const passwordRequirements = '15–128 Unicode characters, at most 512 UTF-8 bytes';
const passwordFailure = `Password must contain ${passwordRequirements}. Spaces are preserved.`;
export const passwordPrompt = `New administrator password (${passwordRequirements}; spaces are preserved): `;
const inputHints: Record<PasswordInputError['code'], string> = {
  cancelled: 'Password input cancelled.',
  too_long: passwordFailure,
  invalid_input: 'Invalid password input; enter valid UTF-8 text.',
};
const hints: Partial<Record<CmsError['code'], string>> = {
  protected_resource: 'An active super administrator already exists; use the existing account.',
  identifier_taken: 'The email address is already in use.',
  invalid_input: 'Invalid administrator details; verify --email and --name.',
  temporarily_unavailable:
    'Required database or operation catalog is unavailable; verify db:migrate and operations:reconcile.',
};

export function initializationFailure(error: unknown): string {
  const prefix = 'Administrator initialization failed: ';
  if (error instanceof PasswordInputError) return `${prefix}${inputHints[error.code]}\n`;
  if (error instanceof z.ZodError) {
    if (error.issues.some((issue) => issue.path[0] === 'password')) {
      return `${prefix}${passwordFailure}\n`;
    }
    return `${prefix}Invalid environment configuration; configure .env using .env.example.\n`;
  }
  const hint = error instanceof CmsError ? hints[error.code] : undefined;
  return `${prefix}${hint ?? 'Verify database configuration, migrations and operation catalog.'}\n`;
}
