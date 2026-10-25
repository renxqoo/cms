import { CmsError } from '@new-cms/cms/platform/contracts';

export function errorResponse(error: unknown, requestId: string): Response {
  const problem = error instanceof CmsError ? error : new CmsError('internal_error');
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' });
  headers.set('cache-control', 'no-store');
  headers.set('x-request-id', requestId);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
  headers.set('referrer-policy', 'no-referrer');
  if (problem.retryAfterSeconds !== undefined) {
    headers.set('retry-after', String(problem.retryAfterSeconds));
  }
  return new Response(
    JSON.stringify({
      error: {
        code: problem.code,
        message: problem.message,
        requestId,
        ...(problem.fieldErrors === undefined ? {} : { fieldErrors: problem.fieldErrors }),
      },
    }),
    { status: problem.status, headers },
  );
}
