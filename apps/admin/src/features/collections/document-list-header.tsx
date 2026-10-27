'use client';

import { FileTextIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { PageHeader } from '@new-cms/ui/layout';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { RegisteredCollection } from '../admin-components/renderers';
import { ListSlot, ListMenu, CollectionIcon } from './list-customization';
import { FolderManager } from './folder-manager';
import { collectionHref } from './query';
import type { DocumentQuery } from './query';
import type { Collection } from '../../contracts/content';
import type { ContentMessages } from './messages';

export function DocumentListHeader({
  collection,
  query,
  t,
  canCreate,
  onFoldersChanged,
}: {
  collection: Collection;
  query: DocumentQuery;
  t: ContentMessages;
  canCreate: boolean;
  onFoldersChanged: () => void;
}) {
  const router = useAppNavigation();
  return (
    <RegisteredCollection
      slot="Header"
      collection={collection}
      document={null}
      editor={null}
      readOnly={!canCreate}
    >
      <PageHeader
        title={`${collection.label} · ${query.trashed ? t.trash : t.active}`}
        description={
          <ListSlot collection={collection} slot="Description">
            {collection.admin?.description ?? t.description}
          </ListSlot>
        }
        icon={
          <CollectionIcon collection={collection}>
            <FileTextIcon />
          </CollectionIcon>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <ListMenu collection={collection} label={t.moreActions} />
            <ListSlot collection={collection} slot="ListActions">
              <FolderManager
                collection={collection.key}
                t={t}
                onChanged={onFoldersChanged}
                {...(collection.admin?.components?.Icon !== undefined
                  ? { icon: <CollectionIcon collection={collection} /> }
                  : {})}
              />
              <Button
                variant="outline"
                onClick={() => router.push(collectionHref(collection.key, 'structure'))}
              >
                {t.structure}
              </Button>
              {canCreate && !query.trashed ? (
                <Button
                  onClick={() =>
                    router.push(
                      `${collectionHref(collection.key, 'new')}?locale=${encodeURIComponent(query.locale)}`,
                    )
                  }
                >
                  {collection.singleton ? t.open : t.create}
                </Button>
              ) : null}
            </ListSlot>
          </div>
        }
      />
    </RegisteredCollection>
  );
}
