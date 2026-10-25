import type { Context } from 'hono';
import type { OperationDefinition, Scope } from '@new-cms/cms/platform/contracts';
import { CmsError } from '@new-cms/cms/platform/contracts';
import type { AccessCheck } from '@new-cms/cms/access';
import type { BusinessHandler } from './handlers.ts';
import type { HttpEnvironment } from './contract.ts';
import { requestContext, routeInput, successResponse } from './contract.ts';

export type StreamingHandler = (context: Context<HttpEnvironment>) => Promise<Response>;

export interface OperationHandlers {
  json: ReadonlyMap<string, BusinessHandler>;
  streaming: ReadonlyMap<string, StreamingHandler>;
}

function collectionScope(context: Context<HttpEnvironment>, input?: unknown): Scope | undefined {
  let collection = context.req.param('collection') ?? context.req.query('collection');
  if (
    collection === undefined &&
    input !== null &&
    typeof input === 'object' &&
    'collection' in input
  ) {
    const { collection: selected } = input;
    if (typeof selected !== 'string') throw new CmsError('invalid_scope');
    collection = selected;
  }
  return collection === undefined
    ? undefined
    : { scopeKind: 'collection', collectionKey: collection };
}

export async function checkOperation(
  context: Context<HttpEnvironment>,
  check: AccessCheck,
  operation: OperationDefinition,
): Promise<void> {
  if (operation.access === 'public' || operation.id === 'identity.logout') return;
  const scope = operation.scopeKind === 'collection' ? collectionScope(context) : undefined;
  const operationId = operation.scopeKind === 'collection' && !scope ? 'access.me' : operation.id;
  await check(requestContext(context), operationId, scope);
}

export async function executeOperation(
  context: Context<HttpEnvironment>,
  options: { operation: OperationDefinition; maxBody: number; check: AccessCheck },
  handlers: OperationHandlers,
): Promise<Response> {
  const stream = handlers.streaming.get(options.operation.id);
  if (stream) return stream(context);
  const handler = handlers.json.get(options.operation.id);
  if (!handler) throw new Error('Operation handler is missing');
  const input = await routeInput(context, options.maxBody);
  if (options.operation.scopeKind === 'collection' && !collectionScope(context)) {
    const scope = collectionScope(context, input);
    if (!scope) throw new CmsError('invalid_scope');
    await options.check(requestContext(context), options.operation.id, scope);
  }
  return successResponse(options.operation, await handler(requestContext(context), input));
}
