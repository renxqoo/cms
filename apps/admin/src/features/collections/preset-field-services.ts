import { requestApi } from '../../api/client';
import type { ApiResult } from '../../api/result';
import { documentPageSchema } from '../../contracts/documents';
import type { Collection } from '../../contracts/content';
import type { PresetAccess } from '../../contracts/query-presets';
import type { FieldServices } from '../fields/types';
import { referenceServices } from './reference-services';
import { documentTitle } from './query';
import { presetCandidateBody, presetCandidateKey } from './preset-candidate';
import type { PresetAction, PresetCandidateContext } from './preset-candidate';
interface PresetServiceInput {
  context: PresetCandidateContext;
  action: PresetAction;
  access: PresetAccess;
  actor: string;
  collections: readonly Collection[];
  report: (result: ApiResult<unknown>) => void;
}
export function presetFieldServices(input: PresetServiceInput): FieldServices {
  const ordinary = referenceServices(input.collections, input.report);
  return {
    ...ordinary,
    referenceContextKey: presetCandidateKey(input.context, input.access, input.actor),
    async searchReferences(query) {
      if (!query.filterOptions) return ordinary.searchReferences(query);
      if (
        !query.collections.includes(query.collection) ||
        query.locale !== input.context.locale ||
        !query.sourcePath
      )
        throw new Error('Invalid reference context');
      const result = await requestApi({
        operation: 'queryPresets.fieldOptions',
        params: { collection: input.context.collection.key },
        body: {
          ...presetCandidateBody(input.context, input.access),
          action: input.action,
          path: query.sourcePath,
          relationTo: query.collection,
          q: query.query,
          ...(query.id ? { targetId: query.id } : {}),
          page: query.page,
          pageSize: 20,
        },
        response: documentPageSchema,
        signal: query.signal,
      });
      if (query.signal.aborted) throw new Error('Reference request cancelled');
      if (!result.ok) {
        input.report(result);
        throw new Error(result.error.code);
      }
      const collection = input.collections.find((entry) => entry.key === query.collection);
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
