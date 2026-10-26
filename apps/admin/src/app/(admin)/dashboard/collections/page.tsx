import { CollectionCatalogPage } from '../../../../features/collections/catalog-page';
import { requireSession } from '../../../../server/require-session';

export default async function Page() {
  await requireSession();
  return <CollectionCatalogPage />;
}
