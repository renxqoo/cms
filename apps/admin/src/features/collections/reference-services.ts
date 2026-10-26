import { requestApi } from '../../api/client';
import type { ApiResult } from '../../api/result';
import { documentPageSchema } from '../../contracts/documents';
import type { Collection } from '../../contracts/content';
import type { FieldServices } from '../fields/types';
import { documentTitle } from './query';

export function referenceServices(
  collections: readonly Collection[],
  report: (result: ApiResult<unknown>) => void,
): FieldServices {
  return {
    collections: collections.map((collection) => ({
      id: collection.key,
      label: collection.label,
      upload: collection.upload,
    })),
    async searchReferences(input) {
      if (!input.collections.includes(input.collection))
        throw new Error('Invalid reference collection');
      const result = await requestApi({
        operation: 'documents.list',
        params: { collection: input.collection },
        query: {
          q: input.query,
          page: input.page,
          pageSize: 20,
          locale: input.locale,
          fallback: [],
          depth: 0,
          mode: 'editing',
        },
        response: documentPageSchema,
        signal: input.signal,
      });
      if (!result.ok) {
        report(result);
        throw new Error(result.error.code);
      }
      const collection = collections.find((candidate) => candidate.key === input.collection);
      return {
        ...result.data,
        rows: result.data.rows.map((document) => ({
          collection: document.collection,
          id: document.id,
          label: documentTitle(document, collection),
        })),
      };
    },
  };
}
