import { defineOperation } from './operation-definition';

export const documentOrderingOperations = [
  defineOperation('documents.order', ['GET', '/v1/collections/:collection/document-order'], {
    queryKeys: ['locale'],
  }),
  defineOperation('documents.reorder', ['POST', '/v1/collections/:collection/document-order']),
  defineOperation(
    'documents.join',
    ['GET', '/v1/collections/:collection/documents/:id/joins/:fieldId'],
    {
      queryKeys: [
        'locale',
        'fallback',
        'mode',
        'depth',
        'page',
        'pageSize',
        'count',
        'where',
        'sort',
      ],
    },
  ),
  defineOperation('documents.reorderJoin', [
    'POST',
    '/v1/collections/:collection/documents/:id/joins/:fieldId/order',
  ]),
] as const;
