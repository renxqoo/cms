import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import {
  createRunner,
  ensureVisible,
  idempotentReference,
  parse,
  requireAdditionalOperation,
  requireRevision,
} from '../runtime.ts';
import { saveInTransaction } from '../documents/save-document.ts';
import { projectDocument } from '../documents/project-document.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import { readRows } from './source.ts';

async function updateDefault(
  state: ContentState,
  input: { runtime: ContentRuntime; id: string; revision: number; value: boolean },
) {
  const authorized = await requireAdditionalOperation(state, {
    runtime: input.runtime,
    operationId: 'documents.update',
    id: input.id,
  });
  return saveInTransaction(
    { ...authorized, operationId: 'languages.setDefault' },
    {
      runtime: input.runtime,
      values: {
        collection: 'languages',
        id: input.id,
        revision: input.revision,
        data: { default: input.value },
      },
      kind: 'defaultLanguageChanged',
    },
  );
}
async function switchDefault(
  state: ContentState,
  input: { runtime: ContentRuntime; id: string; revision: number; expectedDefaultCode: string },
) {
  const rows = await readRows(input.runtime, state.tx, {
    collection: 'languages',
    locale: state.collection.locales.default,
  });
  const previous = rows.rows.find((row) => row.data['default'] === true);
  if (!previous || previous.data['code'] !== input.expectedDefaultCode) fail('version_conflict');
  const target = await ensureVisible(state, { runtime: input.runtime, id: input.id });
  requireRevision(target, input.revision);
  if (previous.document.id === target.id)
    return { id: target.id, versionId: target.currentVersionId };
  const selected = rows.rows.find((row) => row.document.id === target.id);
  if (selected?.data['enabled'] !== true) fail('invalid_input');
  await updateDefault(state, {
    runtime: input.runtime,
    id: previous.document.id,
    revision: previous.document.revision,
    value: false,
  });
  return updateDefault(state, {
    runtime: input.runtime,
    id: target.id,
    revision: input.revision,
    value: true,
  });
}
export function createLanguageManagementApi(runtime: ContentRuntime) {
  return {
    async setDefaultLanguage(this: void, ctx: RequestContext, raw: unknown) {
      const input = parse(runtime.schemas['languages.setDefault'], raw);
      return createRunner(runtime)(
        { ctx, operationId: 'languages.setDefault', collection: input.collection },
        async (state) => {
          const result = await idempotentReference(state, { runtime, input }, () =>
            switchDefault(state, { runtime, ...input }),
          );
          return projectDocument(state, {
            runtime,
            document: await ensureVisible(state, { runtime, id: result.id }),
          });
        },
      );
    },
  };
}
