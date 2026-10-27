import { policyScope } from '../hooks/invoke.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import { hierarchySettings } from '../collections/hierarchy-config.ts';
import { targetState, denied } from '../documents/relation-scopes.ts';
import { ensureVisible, policyContext } from '../runtime.ts';
import { projectData, isFieldReadable } from '../fields/policy-read.ts';
import { targetReadContext } from '../queries/resolve-locale.ts';
import { parentReference } from './validation.ts';
import { valueAtPath } from '../documents/data-path.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentData } from '../definition.ts';

interface Paths {
  slug: string | null;
  title: string | null;
}
export type HierarchyCache = Map<string, Promise<Paths | null>>;
interface PathInput {
  runtime: ContentRuntime;
  documentId: string;
  data: DocumentData;
  policyData: DocumentData;
  cache: HierarchyCache;
  visited: ReadonlySet<string>;
  historyRoot: string | null;
}

function segment(value: string) {
  return (
    value.length > 0 &&
    !value.includes('/') &&
    !value.includes('\\') &&
    safeCharacters(value) &&
    !['.', '..'].includes(value)
  );
}

async function nodeSegments(
  state: ContentState,
  input: { data: DocumentData; policyData: DocumentData; id: string },
) {
  const options = hierarchySettings(state.collection);
  if (!options) return null;
  const parentField = state.collection.fields.find(
    (field) => field.name === options.parentFieldName,
  );
  if (
    !parentField ||
    !(await isFieldReadable(
      parentField,
      { ...policyContext(state, input.policyData), documentId: input.id },
      policyScope(state),
    ))
  )
    return null;
  const data = await projectData({
    ...policyScope(state),
    collection: state.collection,
    data: input.data,
    policyData: input.policyData,
    context: policyContext(state, input.policyData),
  });
  const titleField = state.collection.admin?.useAsTitle;
  const titleValue = titleField ? valueAtPath(data, titleField) : input.id;
  const title = typeof titleValue === 'string' && titleValue.length > 0 ? titleValue : null;
  const rawSlug = slugValue(title, { options, data });
  const slug = typeof rawSlug === 'string' && segment(rawSlug) ? rawSlug : null;
  const rawParent = input.data[options.parentFieldName];
  if (rawParent !== undefined && data[options.parentFieldName] === undefined) return null;
  return {
    title,
    slug,
    parent: parentReference(data, {
      collection: state.collection.key,
      field: options.parentFieldName,
    }),
  };
}

async function ancestor(state: ContentState, input: PathInput, id: string): Promise<Paths | null> {
  const key = `${state.actor.id}:${state.collection.key}:${state.locale}:${state.mode}:${JSON.stringify(state.fallbackOverride ?? null)}:${input.historyRoot ?? ''}:${id}`;
  const existing = input.cache.get(key);
  if (existing) return existing;
  if (input.cache.size >= input.runtime.limits.maxExpandNodes) fail('capacity_exceeded');
  const pending = readAncestor(state, { ...input, documentId: id });
  input.cache.set(key, pending);
  return pending;
}

async function readAncestor(state: ContentState, input: PathInput): Promise<Paths | null> {
  try {
    const reader = await targetState(state, {
      runtime: input.runtime,
      collection: state.collection.key,
    });
    const document = await ensureVisible(reader, { runtime: input.runtime, id: input.documentId });
    const versionId =
      state.mode === 'published' ? document.publishedVersionId : document.currentVersionId;
    if (!versionId) return null;
    const data = await input.runtime.store.readRevisionData(state.tx, {
      collection: state.collection.key,
      documentId: document.id,
      versionId,
      ...targetReadContext({
        collection: state.collection,
        locale: state.locale,
        ...(state.fallbackOverride ? { fallback: state.fallbackOverride } : {}),
      }),
    });
    return computePaths(reader, {
      ...input,
      data: await input.runtime.prepareHierarchyNode(reader, { data, documentId: document.id }),
      policyData: data,
    });
  } catch (error) {
    if (!denied(error)) throw error;
    return null;
  }
}

async function computePaths(state: ContentState, input: PathInput): Promise<Paths | null> {
  if (input.visited.has(input.documentId)) return invalidPath(input, 'invalid_input');
  if (input.visited.size >= input.runtime.workPolicy.maxFolderDepth)
    return invalidPath(input, 'capacity_exceeded');
  const own = await nodeSegments(state, {
    data: input.data,
    policyData: input.policyData,
    id: input.documentId,
  });
  if (!own) return null;
  if (!own.parent) return { slug: own.slug, title: own.title };
  const visited = new Set(input.visited).add(input.documentId);
  if (visited.has(own.parent)) return invalidPath(input, 'invalid_input');
  const parent = await ancestor(state, { ...input, visited }, own.parent);
  return parent
    ? { slug: joinPath(parent.slug, own.slug), title: joinPath(parent.title, own.title) }
    : null;
}

export async function hierarchyReadData(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    data: DocumentData;
    policyData: DocumentData;
    documentId: string;
    cache?: HierarchyCache;
  },
) {
  const options = hierarchySettings(state.collection);
  if (!options) return input.data;
  state.hierarchyReadCache ??= new Map();
  const paths = await computePaths(state, {
    ...input,
    cache: input.cache ?? state.hierarchyReadCache,
    visited: new Set(),
    historyRoot: state.operationId === 'versions.get' ? input.documentId : null,
  });
  return {
    ...input.data,
    [options.slugPathFieldName]: paths?.slug ?? null,
    [options.titlePathFieldName]: paths?.title ?? null,
  };
}

function slugValue(
  title: string | null,
  input: { options: NonNullable<ReturnType<typeof hierarchySettings>>; data: DocumentData },
) {
  if (input.options.slugField) return input.data[input.options.slugField];
  if (title === null) return null;
  if (input.options.slugify) return input.options.slugify.run(title);
  return title
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');
}
function joinPath(parent: string | null, value: string | null) {
  return parent !== null && value !== null ? `${parent}/${value}` : null;
}
function invalidPath(input: PathInput, code: 'invalid_input' | 'capacity_exceeded'): null {
  if (input.historyRoot !== null) return null;
  return fail(code);
}

function safeCharacters(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return false;
  }
  return true;
}
