import { projectDocument } from '../documents/project-document.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import {
  auditContent,
  createRunner,
  ensureVisible,
  idempotentReference,
  parse,
  requireAdditionalOperation,
  requireRevision,
} from '../runtime.ts';
import { lockRevisionResources } from './revision-data.ts';
import { prepareLocaleSnapshot, readLocaleData } from './prepare-write.ts';
import { writeRevision } from './write-revision.ts';
import type { DocumentRow } from '../model.ts';
import type { ContentRuntime, ContentState } from '../types.ts';

export async function restoreTrashInTransaction(
  state: ContentState,
  input: { runtime: ContentRuntime; id: string; revision: number },
): Promise<{ id: string; versionId: string }> {
  const old = await ensureVisible(state, { runtime: input.runtime, id: input.id, trashed: true });
  if (!old.trashedAt) fail('invalid_input');
  requireRevision(old, input.revision);
  const document = await lockRevisionResources(state, {
    runtime: input.runtime,
    document: old,
    revision: input.revision,
    trashed: true,
  });
  const reference = await restoreEffectiveRevision(state, { runtime: input.runtime, document });
  const latest = await input.runtime.store.readDocument(state.tx, {
    collection: state.collection.key,
    id: document.id,
  });
  await input.runtime.store.updateDocumentPointers(state.tx, {
    collection: state.collection.key,
    id: document.id,
    expectedRevision: latest.revision,
    revision: latest.revision + 1,
    currentVersionId: latest.currentVersionId,
    publishedVersionId: state.collection.mode === 'direct' ? latest.currentVersionId : null,
    trashedAt: null,
  });
  await input.runtime.store.syncActiveUnique(state.tx, {
    collection: state.collection.key,
    id: document.id,
  });
  await auditContent(state, {
    runtime: input.runtime,
    id: document.id,
    detail: { kind: 'trashRestored' },
  });
  return reference;
}

async function restoreEffectiveRevision(
  state: ContentState,
  input: { runtime: ContentRuntime; document: DocumentRow },
) {
  const { document } = input;
  let reference = { id: document.id, versionId: document.currentVersionId };
  if (state.collection.mode === 'direct') {
    const writer = await requireAdditionalOperation(state, {
      runtime: input.runtime,
      operationId: 'documents.update',
      id: document.id,
      trashed: true,
    });
    const dataByLocale = await readLocaleData(writer, { runtime: input.runtime, document });
    const prepared = prepareLocaleSnapshot(writer, {
      runtime: input.runtime,
      current: dataByLocale,
      next: dataByLocale,
    });
    reference = await writeRevision(writer, {
      runtime: input.runtime,
      documentId: document.id,
      previous: document,
      data: prepared.dataByLocale[state.locale] ?? {},
      dataByLocale: prepared.dataByLocale,
      kind: 'trashRestored',
    });
  }
  return reference;
}

async function restoreTrash(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['documents.restoreTrash'], raw);
  return createRunner(runtime)(
    { ctx, operationId: 'documents.restoreTrash', collection: input.collection },
    async (state) => {
      const reference = await idempotentReference(state, { runtime, input }, () =>
        restoreTrashInTransaction(state, { runtime, id: input.id, revision: input.revision }),
      );
      return projectDocument(state, {
        runtime,
        document: await ensureVisible(state, { runtime, id: reference.id }),
      });
    },
  );
}

export function createRestoreTrashApi(runtime: ContentRuntime) {
  return {
    restoreTrashedDocument: (ctx: RequestContext, raw: unknown) => restoreTrash(runtime, ctx, raw),
  };
}
