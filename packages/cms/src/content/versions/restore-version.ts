import { projectDocument } from '../documents/project-document.ts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import {
  createRunner,
  ensureVisible,
  idempotentReference,
  parse,
  requireAdditionalOperation,
} from '../runtime.ts';
import { lockRevisionResources } from '../documents/revision-data.ts';
import { prepareLocaleSnapshot, readLocaleData } from '../documents/prepare-write.ts';
import { writeRevision } from '../documents/write-revision.ts';
import { requireHistory } from './api.ts';
import { pruneDocumentVersions } from './retention.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentRow } from '../model.ts';

async function restoreInTransaction(
  state: ContentState,
  input: { runtime: ContentRuntime; id: string; revision: number; versionId: string },
): Promise<{ id: string; versionId: string }> {
  requireHistory(state);
  const document = await ensureVisible(state, { runtime: input.runtime, id: input.id });
  await requireAdditionalOperation(state, {
    runtime: input.runtime,
    operationId: 'versions.get',
    id: input.id,
  });
  await input.runtime.store.readRevision(state.tx, {
    collection: state.collection.key,
    documentId: input.id,
    versionId: input.versionId,
  });
  const writer =
    state.collection.mode === 'direct'
      ? await requireAdditionalOperation(state, {
          runtime: input.runtime,
          operationId: 'documents.update',
          id: input.id,
        })
      : state;
  const { dataByLocale, references } = await prepareRestoration(writer, {
    runtime: input.runtime,
    document,
    versionId: input.versionId,
  });
  await lockRevisionResources(state, {
    runtime: input.runtime,
    document,
    revision: input.revision,
    references,
  });
  const result = await writeRevision(writer, {
    runtime: input.runtime,
    documentId: input.id,
    previous: document,
    source: { documentId: input.id, revisionId: input.versionId },
    data: dataByLocale[state.locale] ?? {},
    dataByLocale,
    kind: 'versionRestored',
  });
  await pruneDocumentVersions(state, { runtime: input.runtime, documentId: input.id });
  return result;
}

async function prepareRestoration(
  writer: ContentState,
  input: { runtime: ContentRuntime; document: DocumentRow; versionId: string },
) {
  const current = await readLocaleData(writer, {
    runtime: input.runtime,
    document: input.document,
  });
  const next = await readLocaleData(writer, input);
  return prepareLocaleSnapshot(writer, {
    runtime: input.runtime,
    current,
    next,
    documentId: input.document.id,
  });
}

async function restoreVersion(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['versions.restore'], raw);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'versions.restore',
      collection: input.collection,
      ...(input.locale ? { locale: input.locale } : {}),
    },
    async (state) => {
      const result = await idempotentReference(state, { runtime, input }, () =>
        restoreInTransaction(state, {
          runtime,
          id: input.id,
          revision: input.revision,
          versionId: input.versionId,
        }),
      );
      return projectDocument(state, {
        runtime,
        document: await ensureVisible(state, { runtime, id: result.id }),
      });
    },
  );
}

export function createVersionRestoreApi(runtime: ContentRuntime) {
  return {
    restoreVersion: (ctx: RequestContext, raw: unknown) => restoreVersion(runtime, ctx, raw),
  };
}
