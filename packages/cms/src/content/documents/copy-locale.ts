import type { RequestContext } from '@new-cms/cms/platform/contracts';
import {
  createRunner,
  ensureVisible,
  idempotentReference,
  parse,
  policyContext,
  requireAdditionalOperation,
  requireRevision,
  resolveLocale,
} from '../runtime.ts';
import { policyScope } from '../hooks/invoke.ts';
import { projectData } from '../fields/policy-read.ts';
import { saveInTransaction } from './save-document.ts';
import { projectDocument } from './project-document.ts';
import { copyLocaleData } from './locale-copy-data.ts';
import { localeMediaSources } from './copy-locale-media.ts';
import type { ContentRuntime, ContentState } from '../types.ts';

type CopyInput = ReturnType<ContentRuntime['schemas']['documents.copyLocale']['parse']>;
async function copySource(
  state: ContentState,
  input: { runtime: ContentRuntime; values: CopyInput; versionId: string },
) {
  const locale = resolveLocale(state.collection, input.values.fromLocale);
  const source = await requireAdditionalOperation(
    { ...state, locale },
    { runtime: input.runtime, operationId: 'documents.get', id: input.values.id },
  );
  const data = await input.runtime.store.readRevisionData(source.tx, {
    collection: state.collection.key,
    documentId: input.values.id,
    versionId: input.versionId,
    locale,
    fallback: [],
  });
  return projectData({
    ...policyScope(source),
    collection: source.collection,
    data,
    context: { ...policyContext(source, data), documentId: input.values.id },
  });
}
async function copyInTransaction(
  state: ContentState,
  input: { runtime: ContentRuntime; values: CopyInput },
) {
  const { runtime, values } = input;
  const document = await ensureVisible(state, { runtime, id: values.id });
  requireRevision(document, values.revision);
  await requireAdditionalOperation(state, { runtime, operationId: 'documents.get', id: values.id });
  const writer = await requireAdditionalOperation(state, {
    runtime,
    operationId: 'documents.update',
    id: values.id,
  });
  const source = await copySource(state, { ...input, versionId: document.currentVersionId });
  const current = await runtime.store.readRevisionData(writer.tx, {
    collection: state.collection.key,
    documentId: document.id,
    versionId: document.currentVersionId,
    locale: state.locale,
    fallback: [],
  });
  const copied = copyLocaleData({
    fields: state.collection.fields,
    from: source,
    to: current,
    overwrite: values.overwrite,
  });
  return saveInTransaction(writer, {
    runtime,
    values: {
      collection: state.collection.key,
      id: values.id,
      revision: values.revision,
      locale: state.locale,
      data: copied.data,
    },
    kind: 'localeCopied',
    mediaSources: localeMediaSources(state, {
      runtime,
      source,
      patch: copied.data,
      fromLocale: values.fromLocale,
      paths: copied.paths,
    }),
  });
}
export function createCopyLocaleApi(runtime: ContentRuntime) {
  return {
    async copyLocale(this: void, ctx: RequestContext, raw: unknown) {
      const values = parse(runtime.schemas['documents.copyLocale'], raw);
      return createRunner(runtime)(
        {
          ctx,
          operationId: 'documents.copyLocale',
          collection: values.collection,
          locale: values.toLocale,
        },
        async (state) => {
          resolveLocale(state.collection, values.fromLocale);
          const reference = await idempotentReference(state, { runtime, input: values }, () =>
            copyInTransaction(state, { runtime, values }),
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
