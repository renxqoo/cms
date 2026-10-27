import type { RequestContext } from '@new-cms/cms/platform/contracts';
import type { ContentRuntime, ContentState } from '../types.ts';
import {
  createRunner,
  parse,
  idempotentReference,
  requireAdditionalOperation,
  ensureVisible,
} from '../runtime.ts';
import { saveInTransaction } from './save-document.ts';
import { projectDocument } from './project-document.ts';

type RenameInput = ReturnType<ContentRuntime['schemas']['documents.renameFile']['parse']>;
async function authorizeRename(
  state: ContentState,
  input: { runtime: ContentRuntime; values: RenameInput },
) {
  const { runtime, values } = input;
  await ensureVisible(state, { runtime, id: values.id });
  for (const operationId of ['documents.get', 'assets.download'])
    await requireAdditionalOperation(state, { runtime, operationId, id: values.id });
  return requireAdditionalOperation(state, {
    runtime,
    operationId: 'documents.update',
    id: values.id,
  });
}
export function createRenameFileApi(runtime: ContentRuntime) {
  return {
    async renameFile(this: void, ctx: RequestContext, raw: unknown) {
      const values = parse(runtime.schemas['documents.renameFile'], raw);
      return createRunner(runtime)(
        {
          ctx,
          operationId: 'documents.renameFile',
          collection: values.collection,
          ...(values.locale ? { locale: values.locale } : {}),
        },
        async (state) => {
          const writer = await authorizeRename(state, { runtime, values });
          const reference = await idempotentReference(state, { runtime, input: values }, () =>
            saveInTransaction(writer, {
              runtime,
              values: {
                collection: values.collection,
                id: values.id,
                revision: values.revision,
                locale: state.locale,
                data: {},
              },
              filename: values.filename,
              kind: 'fileRenamed',
            }),
          );
          const reader = await requireAdditionalOperation(state, {
            runtime,
            operationId: 'documents.get',
            id: values.id,
          });
          return projectDocument(reader, {
            runtime,
            document: await ensureVisible(reader, { runtime, id: reference.id }),
          });
        },
      );
    },
  };
}
