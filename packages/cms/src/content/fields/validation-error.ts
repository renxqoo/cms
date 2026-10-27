import { CmsError } from '@new-cms/cms/platform/contracts';

export function rethrowFieldError(error: unknown, path: string): never {
  if (error instanceof CmsError && error.code === 'invalid_input' && !error.fieldErrors?.length)
    throw new CmsError('invalid_input', {
      fieldErrors: [{ field: path, message: 'Invalid field value.' }],
    });
  throw error;
}
