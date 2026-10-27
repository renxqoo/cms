'use client';

import type { ReactNode } from 'react';
import { EllipsisIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Menu, MenuContent, MenuTrigger } from '@new-cms/ui/overlays';
import { RegisteredCollection } from '../admin-components/renderers';
import { componentReferences } from '../admin-components/component-reference';
import type { CollectionComponentSlot } from '../admin-components/types';
import type { Collection } from '../../contracts/content';

export function ListSlot({
  collection,
  slot,
  children,
}: {
  collection: Collection;
  slot: CollectionComponentSlot;
  children?: ReactNode;
}) {
  return (
    <RegisteredCollection
      collection={collection}
      slot={slot}
      document={null}
      editor={null}
      readOnly
    >
      {children}
    </RegisteredCollection>
  );
}
export function ListMenu({ collection, label }: { collection: Collection; label: string }) {
  if (componentReferences(collection.admin?.components?.listMenuItems).length === 0) return null;
  return (
    <Menu>
      <MenuTrigger render={<Button variant="outline" size="icon" aria-label={label} />}>
        <EllipsisIcon aria-hidden="true" />
      </MenuTrigger>
      <MenuContent>
        <ListSlot collection={collection} slot="listMenuItems" />
      </MenuContent>
    </Menu>
  );
}
export function CollectionIcon({
  collection,
  small = false,
  hierarchy = false,
  children,
}: {
  collection: Collection;
  small?: boolean;
  hierarchy?: boolean;
  children?: ReactNode;
}) {
  const slot = small ? 'SmallIcon' : 'Icon';
  const component = hierarchy ? collection.hierarchy?.components?.[slot] : undefined;
  return (
    <RegisteredCollection
      collection={collection}
      slot={slot}
      document={null}
      editor={null}
      readOnly
      {...(component !== undefined ? { component, namespace: '$hierarchy' } : {})}
    >
      {children}
    </RegisteredCollection>
  );
}
