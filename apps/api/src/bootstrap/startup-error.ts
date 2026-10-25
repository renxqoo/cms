import { z } from 'zod';

export function startupFailure(error: unknown): string {
  if (error instanceof z.ZodError) {
    const fields = error.issues
      .map((issue) => issue.path[0])
      .filter(
        (field): field is string => typeof field === 'string' && /^[A-Z][A-Z0-9_]*$/.test(field),
      );
    if (fields.length > 0) {
      return `CMS startup failed: missing or invalid environment variables: ${[...new Set(fields)].join(', ')}. Configure .env using .env.example.\n`;
    }
  }
  return 'CMS startup failed; verify configuration, migrations and operation catalog.\n';
}
