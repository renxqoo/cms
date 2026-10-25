import { z } from 'zod';

export const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    fieldErrors: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
  }),
});

export type ApiError = z.infer<typeof errorSchema>['error'];

interface ApiFailure {
  ok: false;
  status: number;
  error: ApiError;
  retryAfterSeconds: number | null;
  uncertain: boolean;
}

export type ApiResult<T> = { ok: true; status: number; data: T; requestId: string } | ApiFailure;

export function failure(
  code: string,
  status: number,
  details: { uncertain?: boolean; requestId?: string } = {},
): ApiFailure {
  return {
    ok: false,
    status,
    error: {
      code,
      message: 'The request could not be completed.',
      requestId: details.requestId ?? '',
    },
    retryAfterSeconds: null,
    uncertain: details.uncertain ?? false,
  };
}

export function retryAfter(value: string | null): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds : null;
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : null;
}

function errorResponse(response: Response, value: unknown, write: boolean): ApiFailure {
  const parsed = errorSchema.safeParse(value);
  const retryAfterSeconds = retryAfter(response.headers.get('retry-after'));
  if (!parsed.success)
    return {
      ...failure('invalid_response', response.status, {
        requestId: response.headers.get('x-request-id') ?? '',
        uncertain: write,
      }),
      retryAfterSeconds,
    };
  const uncertain =
    write &&
    [
      'request_timeout',
      'request_cancelled',
      'backend_unavailable',
      'invalid_response',
      'request_failed',
    ].includes(parsed.data.error.code);
  return {
    ok: false,
    status: response.status,
    error: parsed.data.error,
    retryAfterSeconds,
    uncertain,
  };
}

export async function apiResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
  write: boolean,
): Promise<ApiResult<T>> {
  const requestId = response.headers.get('x-request-id') ?? '';
  let value: unknown;
  try {
    value = response.status === 204 ? undefined : await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    if (
      error instanceof Error &&
      'code' in error &&
      (error.code === 'request_timeout' || error.code === 'request_cancelled')
    )
      return failure(error.code, 503, { uncertain: write, requestId });
    return {
      ...failure('invalid_response', response.status, {
        uncertain: write,
        requestId,
      }),
      retryAfterSeconds: retryAfter(response.headers.get('retry-after')),
    };
  }
  if (!response.ok) return errorResponse(response, value, write);
  const parsed = schema.safeParse(value);
  return parsed.success
    ? { ok: true, status: response.status, data: parsed.data, requestId }
    : failure('invalid_response', response.status, { uncertain: write, requestId });
}
