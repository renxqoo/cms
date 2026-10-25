import { projectDocument } from '../documents/project-document.ts';
import { randomUUID } from 'node:crypto';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import {
  createRunner,
  ensureVisible,
  idempotentReference,
  parse,
  requireAdditionalOperation,
} from '../runtime.ts';
import { lockRevisionResources, writeInput } from './revision-data.ts';
import { normalizeLocaleData } from '../fields/normalize-locale-data.ts';
import { inputPatches, prepareLocaleWrite, readLocaleData } from './prepare-write.ts';
import { collectionPredicate } from '../runtime.ts';
import { projectData } from '../fields/policies.ts';
import { writeRevision } from './write-revision.ts';
import type { DocumentRow } from '../model.ts';
import type { DocumentData } from '../definition.ts';
import type { ContentRuntime, ContentState, ContentWriteInput } from '../types.ts';

async function prepareCopy(
  state: ContentState,
  input: { runtime: ContentRuntime; values: ContentWriteInput; source: DocumentRow },
) {
  const reader = await requireAdditionalOperation(state, {
    runtime: input.runtime,
    operationId: 'documents.get',
    id: input.source.id,
  });
  const raw = await readLocaleData(state, { runtime: input.runtime, document: input.source });
  const visible: Record<string, DocumentData> = {};
  for (const locale of state.collection.locales.supported) {
    const { predicate: _old, ...base } = reader;
    const localized = { ...base, locale };
    const predicate = collectionPredicate(localized);
    await ensureVisible(
      { ...localized, ...(predicate ? { predicate } : {}) },
      { runtime: input.runtime, id: input.source.id },
    );
    const data = raw[locale] ?? {};
    visible[locale] = projectData({
      collection: state.collection,
      data,
      context: {
        actor: reader.actor,
        operation: 'documents.get',
        collectionKey: state.collection.key,
        locale,
        data,
      },
    });
  }
  await input.runtime.authorizeActor(state.tx, {
    actorId: state.actor.id,
    operationId: 'documents.create',
    scope: { scopeKind: 'collection', collectionKey: state.collection.key },
  });
  const overridden = normalizeLocaleData({
    collection: state.collection,
    current: visible,
    patches: inputPatches(state, input.values),
    limits: input.runtime.limits,
  });
  return prepareLocaleWrite(state, {
    runtime: input.runtime,
    current: {},
    patches: overridden.dataByLocale,
    creating: true,
  });
}

export async function copyInTransaction(
  state: ContentState,
  input: { runtime: ContentRuntime; values: ContentWriteInput },
): Promise<{ id: string; versionId: string }> {
  const current = await ensureVisible(state, { runtime: input.runtime, id: input.values.id });
  const prepared = await prepareCopy(state, { ...input, source: current });
  const source = await lockRevisionResources(state, {
    runtime: input.runtime,
    document: current,
    revision: input.values.revision,
    references: prepared.references,
  });
  const id = randomUUID();
  await input.runtime.store.insertDocument(state.tx, {
    collection: state.collection.key,
    id,
    actorId: state.actor.id,
    ...(state.collection.singleton ? { singleton: true } : {}),
  });
  return writeRevision(state, {
    runtime: input.runtime,
    documentId: id,
    data: prepared.dataByLocale[state.locale] ?? {},
    dataByLocale: prepared.dataByLocale,
    kind: 'copy',
    source: { documentId: source.id, revisionId: source.currentVersionId },
    ...(input.values.folderId === undefined ? {} : { folderId: input.values.folderId }),
  });
}

async function copyDocument(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['documents.copy'], raw);
  const values = writeInput(input);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'documents.copy',
      collection: input.collection,
      ...(values.locale ? { locale: values.locale } : {}),
    },
    async (state) => {
      const reference = await idempotentReference(state, { runtime, input }, () =>
        copyInTransaction(state, { runtime, values }),
      );
      return projectDocument(state, {
        runtime,
        document: await ensureVisible(state, { runtime, id: reference.id }),
      });
    },
  );
}

export function createCopyDocumentApi(runtime: ContentRuntime) {
  return { copyDocument: (ctx: RequestContext, raw: unknown) => copyDocument(runtime, ctx, raw) };
}
