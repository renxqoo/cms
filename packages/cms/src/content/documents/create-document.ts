import { projectDocument } from '../documents/project-document.ts';
import { randomUUID } from 'node:crypto';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { createRunner, ensureVisible, idempotentReference, parse } from '../runtime.ts';
import { authorizeReferences, languageInput } from './revision-data.ts';
import { inputPatches, prepareLocaleWrite } from './prepare-write.ts';
import { writeRevision } from './write-revision.ts';
import type { ContentRuntime } from '../types.ts';

async function createDocument(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['documents.create'], raw);
  const language = languageInput(input);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'documents.create',
      collection: input.collection,
      ...(language.locale ? { locale: language.locale } : {}),
    },
    async (state) => {
      const reference = await idempotentReference(state, { runtime, input }, async () => {
        const prepared = prepareLocaleWrite(state, {
          runtime,
          current: {},
          patches: inputPatches(state, language),
          creating: true,
        });
        await runtime.store.lockDocuments(state.tx, {
          ids: [...new Set(prepared.references.map((item) => item.id))].toSorted(),
        });
        await authorizeReferences(state, { runtime, references: prepared.references });
        const id = randomUUID();
        await runtime.store.insertDocument(state.tx, {
          collection: input.collection,
          id,
          actorId: state.actor.id,
          ...(state.collection.singleton ? { singleton: true } : {}),
        });
        return writeRevision(state, {
          runtime,
          documentId: id,
          data: prepared.dataByLocale[state.locale] ?? {},
          dataByLocale: prepared.dataByLocale,
          kind: 'create',
          ...(input.uploadId ? { uploadId: input.uploadId } : {}),
          ...(input.folderId === undefined ? {} : { folderId: input.folderId }),
        });
      });
      return projectDocument(state, {
        runtime,
        document: await ensureVisible(state, { runtime, id: reference.id }),
      });
    },
  );
}

export function createCreateDocumentApi(runtime: ContentRuntime) {
  return {
    createDocument: (ctx: RequestContext, raw: unknown) => createDocument(runtime, ctx, raw),
  };
}
