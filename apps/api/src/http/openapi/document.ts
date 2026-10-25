import { z } from 'zod';
import type { OperationDefinition } from '@new-cms/cms/platform/contracts';
import { operationResponses, responseSchemas } from './responses.ts';

function operationInput(operation: OperationDefinition, schema: z.ZodType) {
  const input = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
  const properties = input.properties ?? {};
  const parameters: unknown[] = [];
  if (operation.method === 'POST' && operation.access === 'security') {
    parameters.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: { type: 'string', minLength: 16, maxLength: 128, pattern: '^[\\x20-\\x7E]+$' },
    });
  }
  for (const [name, value] of Object.entries(properties)) {
    const pathParameter = operation.path.includes(`:${name}`);
    if (!pathParameter && !['GET', 'DELETE'].includes(operation.method)) continue;
    parameters.push({
      name,
      in: pathParameter ? 'path' : 'query',
      schema: value,
      required: pathParameter || input.required?.includes(name) === true,
      ...(operation.method === 'DELETE' && name === 'version'
        ? {
            description: 'Required query parameter ?version=N. DELETE request bodies are not read.',
          }
        : {}),
    });
  }
  if (['GET', 'DELETE'].includes(operation.method)) return { parameters };
  const bodyProperties = Object.fromEntries(
    Object.entries(properties).filter(([name]) => !operation.path.includes(`:${name}`)),
  );
  return {
    parameters,
    requestBody: {
      required: operation.id !== 'identity.logout',
      content: {
        'application/json': {
          schema: {
            ...input,
            properties: bodyProperties,
            required: input.required?.filter((name) => name in bodyProperties) ?? [],
          },
        },
      },
    },
  };
}

export function openApiDocument(
  operations: readonly OperationDefinition[],
  schemas: Readonly<Record<string, z.ZodType>>,
) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const operation of operations) {
    const schema = schemas[operation.id];
    if (!schema) throw new Error('Operation input schema is missing');
    const path = operation.path.replaceAll(/:([a-zA-Z]+)/g, '{$1}');
    paths[path] ??= {};
    paths[path][operation.method.toLowerCase()] = {
      operationId: operation.id,
      tags: [operation.module],
      security: operation.access === 'public' ? [] : [{ bearerAuth: [] }],
      ...operationInput(operation, schema),
      responses: operationResponses(operation.id, operation.method),
      'x-access-kind': operation.access,
      'x-scope-kind': operation.scopeKind,
      'x-binding-configurable': operation.bindingConfigurable,
    };
  }
  return {
    openapi: '3.1.0',
    info: { title: 'CMS administration API', version: '1.0.0' },
    paths,
    components: {
      schemas: responseSchemas(),
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
    },
  };
}
