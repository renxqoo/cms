import {
  collectionOGImage,
  privateImageHeaders,
} from '../../../../../../server/collection-og-image';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ collection: string }> },
) {
  const { collection } = await params;
  const query = new URL(request.url).searchParams;
  if (
    [...query.keys()].some(
      (key) => !['id', 'locale', 'view', 'scope'].includes(key) || query.getAll(key).length !== 1,
    )
  )
    return new Response(null, { status: 400, headers: privateImageHeaders });
  const documentId = query.get('id');
  const locale = query.get('locale');
  const view = query.get('view');
  const scope = query.get('scope');
  if (view && scope !== 'document' && scope !== 'collection')
    return new Response(null, { status: 400, headers: privateImageHeaders });
  return collectionOGImage({
    collection,
    signal: request.signal,
    ...(documentId ? { documentId } : {}),
    ...(locale ? { locale } : {}),
    ...(view
      ? { view: { scope: scope === 'document' ? 'document' : 'collection', path: view } }
      : {}),
  });
}
