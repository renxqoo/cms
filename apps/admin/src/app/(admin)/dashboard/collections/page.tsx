import { requireSession } from '../../../../server/require-session';
import { CollectionCatalog } from '../../../../features/collections/collection-catalog';
export default async function Page() {
  await requireSession();
  return <CollectionCatalog />;
}
