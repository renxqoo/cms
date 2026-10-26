import type { MiddlewareHandler } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { HttpEnvironment } from './contract.ts';

export function responseSecurityHeaders(): MiddlewareHandler<HttpEnvironment> {
  const protect = secureHeaders({ crossOriginResourcePolicy: false });
  return async (context, next) => {
    await protect(context, next);
    if (!context.res.headers.has('cross-origin-resource-policy'))
      context.header('cross-origin-resource-policy', 'same-origin');
  };
}
