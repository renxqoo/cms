import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { CmsError } from '@new-cms/cms/platform/contracts';
import type { AccessApi, AccessCheck } from '@new-cms/cms/access';
import type { IdentityApi } from '@new-cms/cms/identity';
import type { OperationDefinition } from '@new-cms/cms/platform/contracts';
import type { z } from 'zod';
import type { ApplicationConfig } from '../bootstrap/load-config.ts';
import { requestContext, routeInput, successResponse } from './contract.ts';
import type { HttpEnvironment } from './contract.ts';
import { errorResponse } from './errors.ts';
import { businessHandlers } from './handlers.ts';
import type { Admission } from './lifecycle.ts';
import { requestLifecycle } from './lifecycle.ts';
import { openApiDocument } from './openapi/document.ts';

export interface HttpDependencies extends Admission {
  identity: IdentityApi;
  access: AccessApi;
  check: AccessCheck;
  operations: readonly OperationDefinition[];
  inputSchemas: Readonly<Record<string, z.ZodType>>;
  ready(): Promise<void>;
}

function registerOperations(
  app: Hono<HttpEnvironment>,
  deps: HttpDependencies,
  maxBody: number,
): void {
  const handlers = businessHandlers(deps.identity, deps.access);
  const seen = new Set<string>();
  for (const operation of deps.operations) {
    const handler = handlers.get(operation.id);
    if (!handler || seen.has(operation.id)) throw new Error('Invalid operation registration');
    seen.add(operation.id);
    app.on(
      operation.method,
      operation.path,
      async (c, next) => {
        if (operation.access !== 'public' && operation.id !== 'identity.logout') {
          await deps.check(requestContext(c), operation.id);
        }
        return next();
      },
      async (c) => {
        const value = await handler(requestContext(c), await routeInput(c, maxBody));
        return successResponse(operation, value);
      },
    );
  }
  if (seen.size !== handlers.size)
    throw new Error('A business handler has no registered operation');
}

function registerInfrastructure(app: Hono<HttpEnvironment>, deps: HttpDependencies): void {
  app.get('/livez', (c) => c.json({ status: 'ok' }));
  app.get('/readyz', async (c) => {
    await deps.ready();
    return c.json({ status: 'ready' });
  });
  app.get('/openapi.json', async (c) => {
    await deps.check(requestContext(c), 'endpoints.list');
    return c.json(openApiDocument(deps.operations, deps.inputSchemas));
  });
  app.options('*', (c) => {
    if (!c.req.header('origin')) throw new CmsError('invalid_input');
    c.header('access-control-allow-methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
    c.header('access-control-allow-headers', 'Authorization,Content-Type,Idempotency-Key');
    c.header('access-control-max-age', '600');
    return c.body(null, 204);
  });
}

export function createApp(deps: HttpDependencies, config: ApplicationConfig['http']) {
  const app = new Hono<HttpEnvironment>();
  app.use('*', secureHeaders());
  app.use('*', requestLifecycle(config, deps));
  app.onError((error, c) => errorResponse(error, c.get('requestId')));
  app.notFound((c) => errorResponse(new CmsError('not_found'), c.get('requestId')));
  registerInfrastructure(app, deps);
  registerOperations(app, deps, config.bodyLimitBytes);
  return app;
}
