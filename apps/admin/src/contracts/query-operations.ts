import { defineOperation } from './operation-definition';

function presetOperations() {
  const page = ['page', 'pageSize'] as const;
  return [
    defineOperation('queryPresets.preview', [
      'POST',
      '/v1/collections/:collection/query-presets/preview',
    ]),
    defineOperation('queryPresets.fieldOptions', [
      'POST',
      '/v1/collections/:collection/query-presets/options',
    ]),
    defineOperation('queryPresets.list', ['GET', '/v1/collections/:collection/query-presets'], {
      queryKeys: [...page, 'locale'],
    }),
    defineOperation('queryPresets.create', ['POST', '/v1/collections/:collection/query-presets'], {
      idempotency: 'required',
    }),
    defineOperation('queryPresets.update', [
      'PATCH',
      '/v1/collections/:collection/query-presets/:id',
    ]),
    defineOperation('queryPresets.share', [
      'PUT',
      '/v1/collections/:collection/query-presets/:id/sharing',
    ]),
    defineOperation(
      'queryPresets.delete',
      ['DELETE', '/v1/collections/:collection/query-presets/:id'],
      { queryKeys: ['version', 'locale'], responseKind: 'empty' },
    ),
  ] as const;
}

export function queryOperations(documents: readonly string[]) {
  return [...presetOperations(), ...groupingOperations(documents)] as const;
}

function groupingOperations(documents: readonly string[]) {
  return [
    defineOperation('documents.distinct', ['GET', '/v1/collections/:collection/distinct-values'], {
      queryKeys: [
        'field',
        'order',
        'page',
        'pageSize',
        'locale',
        'fallback',
        'mode',
        'q',
        'where',
        'trashed',
        'folderId',
        'context',
      ],
    }),
    defineOperation('documents.groups', ['GET', '/v1/collections/:collection/document-groups'], {
      queryKeys: [...documents, 'groupBy', 'groupPageSize', 'queryByGroup'],
    }),
  ] as const;
}
