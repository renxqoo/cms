import { requestApi } from '../../api/client';
import type { ApiResult } from '../../api/result';
import { documentListSchema } from '../../contracts/content';
import type { Collection } from '../../contracts/content';
import type { FieldServices } from '../fields/types';
import { documentTitle } from './document-label';
export function referenceServices(
  collections: readonly Collection[],
  can: (collection: string) => boolean,
  report: Parameters<typeof createServices>[2],
): FieldServices {
  return createServices(collections, can, report);
}
function createServices(
  collections: readonly Collection[],
  can: (collection: string) => boolean,
  report: (result: ApiResult<unknown>) => void,
): FieldServices {
  return {
    collections: collections.map((collection) => ({
      id: collection.key,
      label: collection.label,
      upload: collection.upload,
    })),
    async searchReferences(input) {
      const collection = collections.find((item) => item.key === input.collection);
      if (!collection || !input.collections.includes(collection.key) || !can(collection.key))
        throw new Error('Reference directory is unavailable');
      const result = await requestApi({
        operation: 'documents.list',
        params: { collection: collection.key },
        query: {
          q: input.query,
          page: input.page,
          pageSize: 20,
          locale: input.locale,
          fallback: [],
          depth: 0,
          mode: 'editing',
          trashed: false,
        },
        response: documentListSchema,
        signal: input.signal,
      });
      report(result);
      if (!result.ok) throw new Error('Reference directory is unavailable');
      return {
        ...result.data,
        rows: result.data.rows.map((document) => ({
          collection: collection.key,
          id: document.id,
          label: documentTitle(document, collection),
        })),
      };
    },
  };
}
