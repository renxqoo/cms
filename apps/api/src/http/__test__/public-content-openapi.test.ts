import { expect, it } from 'vitest';
import { z } from 'zod';
import {
  publicContentOperations,
  publicContentInputSchemas,
} from '../../config/public-content-operations.ts';
import { openApiDocument } from '../openapi/document.ts';

it('documents flat public filters, direct envelopes, media ranges and opaque preview authentication', () => {
  const document = openApiDocument(publicContentOperations, publicContentInputSchemas);
  expect(document.paths['/v1/public/models']?.['get']).toMatchObject({
    security: [],
    responses: {
      '200': {
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/PublicModelCatalog' } },
        },
      },
      '304': { description: 'Existing representation matches If-None-Match' },
    },
  });
  expect(document.paths['/v1/preview/models/{slug}/integrations']?.['get']).toMatchObject({
    security: [{ previewGrant: [] }],
    responses: {
      '200': {
        headers: { 'X-Preview-Expires-At': { schema: { type: 'string', format: 'date-time' } } },
      },
    },
  });
  expect(document.paths['/v1/preview/revoke']?.['post']).not.toHaveProperty('requestBody');
  expect(document.paths['/v1/public/media/{bindingId}']?.['get']).toMatchObject({
    responses: {
      '206': { headers: { 'Content-Range': { schema: { type: 'string' } } } },
      '416': { description: 'Single byte range is unsatisfiable' },
    },
  });
  expect(document.paths['/v1/public/index']?.['get']).toMatchObject({
    responses: {
      '200': {
        content: {
          'application/x-ndjson': { schema: { $ref: '#/components/schemas/PublicExportFrame' } },
        },
      },
    },
  });
});

it('documents public query and single range header schema without JSON encoded filter parameters', () => {
  const document = openApiDocument(publicContentOperations, publicContentInputSchemas);
  expect(
    z
      .object({ parameters: z.array(z.unknown()) })
      .parse(document.paths['/v1/public/models']?.['get']).parameters,
  ).toContainEqual({
    name: 'sort',
    in: 'query',
    required: false,
    schema: { type: 'string', enum: ['order', 'title', 'updated'] },
  });
  expect(
    z
      .object({ parameters: z.array(z.unknown()) })
      .parse(document.paths['/v1/public/media/{bindingId}']?.['get']).parameters,
  ).toContainEqual({
    name: 'Range',
    in: 'header',
    schema: { type: 'string' },
    description: 'One byte range; supported by GET and HEAD.',
  });
});
