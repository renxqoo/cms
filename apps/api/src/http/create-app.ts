import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { CmsError } from '@new-cms/cms/platform/contracts';
import type { AccessApi, AccessCheck } from '@new-cms/cms/access';
import type { IdentityApi } from '@new-cms/cms/identity';
import type { OperationDefinition, RequestContext } from '@new-cms/cms/platform/contracts';
import type { Schema } from './openapi/schema.ts';
import { z } from 'zod';
import type { ApplicationConfig } from '../bootstrap/load-config.ts';
import { requestContext } from './contract.ts';
import { checkOperation, executeOperation } from './operation-handlers.ts';
import type { StreamingHandler } from './operation-handlers.ts';
import type { BusinessHandler } from './handlers.ts';
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
  ready(signal?: AbortSignal): Promise<void>;
  handlers?: ReadonlyMap<string, BusinessHandler>;
  streamingHandlers?: ReadonlyMap<string, StreamingHandler>;
  openApiSchemas?(ctx: RequestContext): Promise<Record<string, Schema>>;
}

function registerOperations(
  app: Hono<HttpEnvironment>,
  deps: HttpDependencies,
  maxBody: number,
): void {
  const handlers = businessHandlers(deps.identity, deps.access);
  for (const [id, handler] of deps.handlers ?? []) {
    if (handlers.has(id)) throw new Error('Duplicate operation handler');
    handlers.set(id, handler);
  }
  const streaming = deps.streamingHandlers ?? new Map<string, StreamingHandler>();
  const seen = new Set<string>();
  for (const operation of deps.operations) {
    const handler = handlers.get(operation.id);
    if (
      (!handler && !streaming.has(operation.id)) ||
      seen.has(operation.id) ||
      (handler && streaming.has(operation.id))
    )
      throw new Error('Invalid operation registration');
    seen.add(operation.id);
    const schema = deps.inputSchemas[operation.id];
    if (!schema) throw new Error('Operation input schema is missing');
    const versionedDelete =
      operation.method === 'DELETE' &&
      z
        .toJSONSchema(schema, { io: 'input', unrepresentable: 'any' })
        .required?.includes('version') === true;
    app.on(
      operation.method,
      operation.path,
      async (c, next) => {
        await checkOperation(c, deps.check, operation);
        return next();
      },
      (c) =>
        executeOperation(
          c,
          { operation, maxBody, check: deps.check, versionedDelete },
          { json: handlers, streaming },
        ),
    );
  }
  if (seen.size !== handlers.size + streaming.size)
    throw new Error('A business handler has no registered operation');
}

function registerInfrastructure(app: Hono<HttpEnvironment>, deps: HttpDependencies): void {
  app.get('/livez', (c) => c.json({ status: 'ok' }));
  app.get('/readyz', async (c) => {
    await deps.ready(c.get('signal'));
    return c.json({ status: 'ready' });
  });
  app.get('/openapi.json', async (c) => {
    await deps.check(requestContext(c), 'endpoints.list');
    const schemas = await deps.openApiSchemas?.(requestContext(c));
    return c.json(openApiDocument(deps.operations, deps.inputSchemas, schemas));
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
  app.use('*', requestLifecycle(config, deps, deps.operations));
  app.onError((error, c) => errorResponse(error, c.get('requestId')));
  app.notFound((c) => errorResponse(new CmsError('not_found'), c.get('requestId')));
  registerInfrastructure(app, deps);
  registerOperations(app, deps, config.bodyLimitBytes);
  return app;
}
