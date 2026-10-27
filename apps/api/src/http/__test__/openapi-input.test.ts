import { expect, it } from 'vitest';
import { z } from 'zod';
import { contentOperations } from '@new-cms/cms/content';
import { openApiDocument } from '../openapi/document.ts';

const target = { collection: z.string(), id: z.uuid(), revision: z.number().int().positive() };
const data = z.record(z.string(), z.unknown());
const schema = z.xor([
  z.strictObject({ ...target, locale: z.string().optional(), data }),
  z.strictObject({ ...target, dataByLocale: z.record(z.string(), data) }),
]);

it('describes both atomic locale write branches while keeping collection and id in the URL', () => {
  const operation = contentOperations.find((item) => item.id === 'documents.update');
  if (!operation) throw new Error('Document update operation is missing');
  const document = openApiDocument([operation], { 'documents.update': schema });
  const update = document.paths['/v1/collections/{collection}/documents/{id}']?.['patch'];
  expect(update).toMatchObject({
    parameters: [
      {
        name: 'X-CMS-Editor-Session',
        in: 'header',
        required: false,
        schema: { type: 'string', format: 'uuid' },
      },
      { name: 'collection', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    ],
    requestBody: {
      content: {
        'application/json': {
          schema: {
            oneOf: [
              {
                properties: { revision: { type: 'integer' }, data: { type: 'object' } },
                required: ['revision', 'data'],
                additionalProperties: false,
              },
              {
                properties: { revision: { type: 'integer' }, dataByLocale: { type: 'object' } },
                required: ['revision', 'dataByLocale'],
                additionalProperties: false,
              },
            ],
          },
        },
      },
    },
  });
  const serialized = JSON.stringify(update);
  expect(serialized).not.toContain('"required":["collection"');
  expect(serialized).not.toContain('"properties":{"collection"');
});
