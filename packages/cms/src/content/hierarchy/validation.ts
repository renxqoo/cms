import { fail } from '@new-cms/cms/platform/contracts';
import { hierarchySettings } from '../collections/hierarchy-config.ts';
import { objectValue } from '../fields/json-value.ts';
import { allowedCollectionTypes } from './collection-scope.ts';
import { targetState } from '../documents/relation-scopes.ts';
import { ensureVisible } from '../runtime.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentData, ReferenceValue } from '../definition.ts';

export function parentReference(data: DocumentData, input: { collection: string; field: string }) {
  const value = data[input.field];
  if (value === undefined || value === null) return null;
  if (
    !objectValue(value) ||
    value['collection'] !== input.collection ||
    typeof value['id'] !== 'string'
  )
    fail('invalid_input');
  return value['id'];
}

async function currentNode(state: ContentState, input: { runtime: ContentRuntime; id: string }) {
  const document = await ensureVisible(state, input);
  const data = await input.runtime.store.readRevisionData(state.tx, {
    collection: state.collection.key,
    documentId: input.id,
    versionId:
      state.mode === 'published'
        ? (document.publishedVersionId ?? fail('not_found'))
        : document.currentVersionId,
    locale: state.locale,
    fallback: [],
  });
  return { document, data };
}

async function parentDepth(
  state: ContentState,
  input: { runtime: ContentRuntime; id: string; data: DocumentData; parentField: string },
) {
  let parent = parentReference(input.data, {
    collection: state.collection.key,
    field: input.parentField,
  });
  const seen = new Set([input.id]);
  let depth = 1;
  if (parent === null) return depth;
  const reader = await targetState(state, {
    runtime: input.runtime,
    collection: state.collection.key,
  });
  while (parent !== null) {
    if (seen.has(parent)) fail('invalid_input');
    if (++depth > input.runtime.workPolicy.maxFolderDepth) fail('capacity_exceeded');
    seen.add(parent);
    const { data } = await currentNode(reader, { runtime: input.runtime, id: parent });
    parent = parentReference(data, { collection: state.collection.key, field: input.parentField });
  }
  return depth;
}

async function childIds(
  state: ContentState,
  input: { runtime: ContentRuntime; parents: readonly string[]; field: string },
) {
  const result: string[] = [];
  for (
    let offset = 0;
    offset < input.parents.length;
    offset += input.runtime.limits.maxArrayItems
  ) {
    const parents = input.parents.slice(offset, offset + input.runtime.limits.maxArrayItems);
    let page = 1;
    while (true) {
      const children = await input.runtime.store.queryDocuments(state.tx, {
        collection: state.collection.key,
        query: {
          locale: state.locale,
          mode: 'editing',
          fallback: [],
          page,
          pageSize: input.runtime.limits.maxPageSize,
          where: {
            field: input.field,
            operator: 'in',
            value: parents.map((id) => ({ collection: state.collection.key, id })),
          },
          select: [],
          sort: [],
        },
        limits: input.runtime.limits,
      });
      result.push(...children.rows.map((row) => row.document.id));
      if (result.length > input.runtime.limits.maxExpandNodes) fail('capacity_exceeded');
      if (page * children.pageSize >= children.total) break;
      page += 1;
    }
  }
  return result;
}

async function descendantsFit(
  state: ContentState,
  input: { runtime: ContentRuntime; id: string; depth: number; parentField: string },
) {
  let frontier = [input.id];
  let { depth } = input;
  const seen = new Set(frontier);
  while (frontier.length > 0) {
    const children = await childIds(state, {
      runtime: input.runtime,
      parents: frontier,
      field: input.parentField,
    });
    const next = children.filter((id) => !seen.has(id));
    for (const id of next) seen.add(id);
    if (seen.size > input.runtime.limits.maxExpandNodes) fail('capacity_exceeded');
    if (next.length > 0 && ++depth > input.runtime.workPolicy.maxFolderDepth)
      fail('capacity_exceeded');
    frontier = next;
  }
}

async function protectExistingReferences(
  state: ContentState,
  input: { runtime: ContentRuntime; id: string; data: DocumentData; typeField: string },
) {
  const allowed = allowedCollectionTypes(input.data, input.typeField);
  if (allowed.length === 0) return;
  const references = await input.runtime.store.inboundReferences(state.tx, {
    collection: state.collection.key,
    id: input.id,
    active: true,
  });
  if (references.length > input.runtime.limits.maxExpandNodes) fail('capacity_exceeded');
  if (
    references.some(
      (reference) =>
        reference.sourceCollection !== state.collection.key &&
        !allowed.includes(reference.sourceCollection),
    )
  )
    fail('resource_in_use');
}

export async function validateHierarchyRevision(
  state: ContentState,
  input: { runtime: ContentRuntime; documentId: string; revisionId: string },
) {
  const options = hierarchySettings(state.collection);
  if (!options) return;
  const data = await input.runtime.store.readRevisionData(state.tx, {
    collection: state.collection.key,
    documentId: input.documentId,
    versionId: input.revisionId,
    locale: state.locale,
    fallback: [],
  });
  const depth = await parentDepth(state, {
    ...input,
    id: input.documentId,
    data,
    parentField: options.parentFieldName,
  });
  await descendantsFit(state, {
    ...input,
    id: input.documentId,
    depth,
    parentField: options.parentFieldName,
  });
  if (options.collectionSpecific)
    await protectExistingReferences(state, {
      ...input,
      id: input.documentId,
      data,
      typeField: options.collectionSpecific.fieldName,
    });
}

export async function validateHierarchyReferences(
  state: ContentState,
  input: { runtime: ContentRuntime; references: readonly ReferenceValue[] },
) {
  const seen = new Set<string>();
  for (const reference of input.references) {
    const collection = input.runtime.registry.get(reference.collection);
    const options = hierarchySettings(collection);
    if (
      !options?.collectionSpecific ||
      collection.key === state.collection.key ||
      seen.has(reference.id)
    )
      continue;
    seen.add(reference.id);
    const reader = await targetState(state, { runtime: input.runtime, collection: collection.key });
    const { data } = await currentNode(reader, { runtime: input.runtime, id: reference.id });
    const allowed = allowedCollectionTypes(data, options.collectionSpecific.fieldName);
    if (allowed.length > 0 && !allowed.includes(state.collection.key)) fail('forbidden');
  }
}

export async function validateHierarchyPublication(
  state: ContentState,
  input: { runtime: ContentRuntime; documentId: string; versionId: string },
) {
  const options = hierarchySettings(state.collection);
  if (!options) return;
  const data = await input.runtime.store.readRevisionData(state.tx, {
    collection: state.collection.key,
    documentId: input.documentId,
    versionId: input.versionId,
    locale: state.locale,
    fallback: [],
  });
  await parentDepth(
    { ...state, mode: 'published' },
    { runtime: input.runtime, id: input.documentId, data, parentField: options.parentFieldName },
  );
}

export async function assertHierarchyUnpublication(
  state: ContentState,
  input: { runtime: ContentRuntime; documentId: string },
) {
  const options = hierarchySettings(state.collection);
  if (!options) return;
  const parent = state.collection.fields.find((field) => field.name === options.parentFieldName);
  const references = await input.runtime.store.inboundReferences(state.tx, {
    collection: state.collection.key,
    id: input.documentId,
    active: true,
  });
  if (references.length > input.runtime.limits.maxExpandNodes) fail('capacity_exceeded');
  for (const reference of references) {
    if (reference.sourceCollection !== state.collection.key || reference.fieldId !== parent?.id)
      continue;
    const source = await input.runtime.store.readDocument(state.tx, {
      collection: state.collection.key,
      id: reference.sourceDocumentId,
      locale: state.locale,
    });
    if (!source.trashedAt && source.publishedVersionId === reference.sourceRevisionId)
      fail('resource_in_use');
  }
}
