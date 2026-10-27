import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { collectionSchema } from '../contracts/content';
import { documentSchema } from '../contracts/documents';
import { requestBackend } from './api';
import { loadAdminConfig } from './config';
import { sessionToken } from './session';
import { requireSession } from './require-session';
export interface CollectionPresentationInput {
  collection: string;
  documentId?: string;
  locale?: string;
  signal?: AbortSignal;
}
async function readAuthorizedPresentation(input: CollectionPresentationInput) {
  await requireSession(input.signal);
  const configuration = loadAdminConfig();
  const values = (await cookies()).getAll(configuration.cookieName);
  const token =
    values.length === 1
      ? sessionToken(`${configuration.cookieName}=${values[0]?.value ?? ''}`, configuration)
      : undefined;
  if (!token) notFound();
  const query = input.locale ? { locale: input.locale } : {};
  const catalog = await requestBackend({
    operation: 'collections.get',
    params: { collection: input.collection },
    query,
    token,
    response: collectionSchema,
    ...(input.signal ? { signal: input.signal } : {}),
  });
  if (!catalog.ok || catalog.data.admin?.hidden) notFound();
  if (!input.documentId) return { collection: catalog.data, document: null };
  const result = await requestBackend({
    operation: 'documents.get',
    params: { collection: input.collection, id: input.documentId },
    query: { ...query, depth: 0, fallback: [] },
    token,
    response: documentSchema,
    ...(input.signal ? { signal: input.signal } : {}),
  });
  if (!result.ok) notFound();
  return { collection: catalog.data, document: result.data };
}

const readCachedPresentation = cache(
  (collection: string, documentId: string | undefined, locale: string | undefined) =>
    readAuthorizedPresentation({
      collection,
      ...(documentId ? { documentId } : {}),
      ...(locale ? { locale } : {}),
    }),
);
export function readCollectionPresentation(input: CollectionPresentationInput) {
  return input.signal
    ? readAuthorizedPresentation(input)
    : readCachedPresentation(input.collection, input.documentId, input.locale);
}
