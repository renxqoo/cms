import { renderCollectionOG } from './collection-og-render';
import 'server-only';
import { appConfig } from '../config/app';
import { collectionOGPolicy as policy, collectionOGText } from './collection-og-policy';
import { readCollectionMetadataContext } from './collection-page-metadata';
import type { CollectionMetadataInput } from './collection-page-metadata';
import { loadAdminConfig } from './config';
import { requestLifetime } from './transport';

export const privateImageHeaders = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff',
} as const;
let activeRenders = 0;
export async function collectionOGImage(input: CollectionMetadataInput): Promise<Response> {
  const lifetime = requestLifetime(input.signal, loadAdminConfig().requestTimeoutMs);
  try {
    return await authorizedImage(input, lifetime.signal);
  } catch {
    return new Response(null, { status: 503, headers: privateImageHeaders });
  } finally {
    lifetime.close();
  }
}
type ImageContext = Awaited<ReturnType<typeof readCollectionMetadataContext>>;
async function authorizedImage(
  input: CollectionMetadataInput,
  signal: AbortSignal,
): Promise<Response> {
  let context: ImageContext;
  try {
    context = await readCollectionMetadataContext({ ...input, signal });
  } catch {
    return new Response(null, { status: signal.aborted ? 503 : 404, headers: privateImageHeaders });
  }
  if (context.metadata['defaultOGImageType'] === 'off')
    return new Response(null, { status: 404, headers: privateImageHeaders });
  if (activeRenders >= policy.maxConcurrentRenders)
    return new Response(null, { status: 503, headers: privateImageHeaders });
  activeRenders += 1;
  try {
    return await renderImage(context, signal);
  } finally {
    activeRenders -= 1;
  }
}
async function renderImage(context: ImageContext, signal: AbortSignal): Promise<Response> {
  const staticImage = context.metadata['defaultOGImageType'] === 'static';
  const title = collectionOGText(
    staticImage ? appConfig.name : context.title,
    policy.maxTitleCharacters,
  );
  const description = collectionOGText(
    staticImage ? '' : (context.presentation.collection.admin?.description ?? ''),
    policy.maxDescriptionCharacters,
  );
  const rendered = await renderCollectionOG({ title, description, brand: appConfig.name, signal });
  for (const [name, value] of Object.entries(privateImageHeaders))
    rendered.headers.set(name, value);
  return rendered;
}
