import { z } from 'zod';
import type { OperationDefinition } from '@new-cms/cms/platform/contracts';
import { operationResponses, responseSchemas } from './responses.ts';
import type { Schema } from './schema.ts';
import { bodySchema, inputProperties } from './input-schema.ts';
import type { InputSchema } from './input-schema.ts';
import { recoveryOperationInput } from './recovery-schemas.ts';

function headerParameters(operation: OperationDefinition): unknown[] {
  const parameters: unknown[] = conditionalHeaders(operation);
  if (operation.module === 'content' && !['GET'].includes(operation.method))
    parameters.push({
      name: 'X-CMS-Editor-Session',
      in: 'header',
      required: false,
      schema: { type: 'string', format: 'uuid' },
    });
  if (operation.idempotency === 'required') {
    parameters.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: { type: 'string', minLength: 16, maxLength: 128, pattern: '^[\\x20-\\x7E]+$' },
    });
  }
  return parameters;
}

function operationInput(operation: OperationDefinition, schema: z.ZodType) {
  if (operation.id === 'access.readRecovery') return recoveryOperationInput(schema);
  const input = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
  const properties = inputProperties(input);
  const parameters = headerParameters(operation);
  for (const [name, value] of Object.entries(properties)) {
    const pathParameter = operation.path.includes(`:${name}`);
    if (!pathParameter && !['GET', 'DELETE'].includes(operation.method)) continue;
    parameters.push({
      name,
      in: pathParameter ? 'path' : 'query',
      ...(jsonQuery(operation, name, pathParameter)
        ? {
            content: {
              'application/json': {
                schema: name === 'where' ? { $ref: '#/components/schemas/ContentWhere' } : value,
              },
            },
          }
        : { schema: value }),
      required: pathParameter || input.required?.includes(name) === true,
      ...(operation.method === 'DELETE' && name === 'version'
        ? {
            description: 'Required query parameter ?version=N. DELETE request bodies are not read.',
          }
        : {}),
    });
  }
  if (['GET', 'DELETE'].includes(operation.method)) return { parameters };
  return { parameters, ...requestBodyFor(operation, input) };
}

function requestBodyFor(operation: OperationDefinition, input: InputSchema) {
  if (operation.id === 'previewContent.revoke') return {};
  if (operation.id === 'assets.writeUpload')
    return {
      requestBody: {
        required: true,
        content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
      },
    };
  return {
    requestBody: {
      required: !['identity.logout', 'previewContent.revoke'].includes(operation.id),
      content: {
        'application/json': {
          schema: bodySchema(input, operation.path),
        },
      },
    },
  };
}

export function openApiDocument(
  operations: readonly OperationDefinition[],
  schemas: Readonly<Record<string, z.ZodType>>,
  extraSchemas: Readonly<Record<string, Schema>> = {},
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
      security: operationSecurity(operation),
      ...operationInput(operation, schema),
      responses: operationResponses(operation),
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
      schemas: { ...responseSchemas(), ...extraSchemas },
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
        previewGrant: {
          type: 'http',
          scheme: 'bearer',
          description: 'Short-lived opaque preview grant; CMS session tokens are not accepted.',
        },
      },
    },
  };
}

function operationSecurity(operation: OperationDefinition) {
  if (operation.id.startsWith('previewContent.')) return [{ previewGrant: [] }];
  return operation.access === 'public' ? [] : [{ bearerAuth: [] }];
}
function jsonQuery(operation: OperationDefinition, name: string, pathParameter: boolean): boolean {
  return (
    !pathParameter &&
    !operation.id.startsWith('publicContent.') &&
    ['where', 'sort', 'select', 'fallback'].includes(name)
  );
}

function conditionalHeaders(operation: OperationDefinition): unknown[] {
  if (operation.id === 'publicContent.media' || operation.id === 'previewContent.media')
    return [
      {
        name: 'Range',
        in: 'header',
        schema: { type: 'string' },
        description: 'One byte range; supported by GET and HEAD.',
      },
      { name: 'If-Range', in: 'header', schema: { type: 'string' } },
      ...(operation.id === 'publicContent.media'
        ? [{ name: 'If-None-Match', in: 'header', schema: { type: 'string' } }]
        : []),
    ];
  return operation.id.startsWith('publicContent.') &&
    !['publicContent.index', 'publicContent.sitemap'].includes(operation.id)
    ? [{ name: 'If-None-Match', in: 'header', schema: { type: 'string' } }]
    : [];
}
