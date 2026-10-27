'use client';

import type { ReactNode } from 'react';
import { Button } from '@new-cms/ui/actions';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useShell } from '../../components/shell/shell-provider';
import { RegisteredCollection } from '../admin-components/renderers';
import type { CollectionComponentProps } from '../admin-components/types';
import { collectionHref } from './query';

export function customViewHref(
  collection: string,
  view: { scope: 'collection' | 'document'; path: string },
  documentId?: string,
) {
  const root = collectionHref(collection, documentId);
  return `${root}/views/${view.path.split('/').map(encodeURIComponent).join('/')}`;
}
export function CollectionViewNavigation({
  collection,
  document,
  editor,
  scope,
}: CollectionComponentProps & { scope: 'collection' | 'document' }) {
  const navigation = useAppNavigation();
  const language = useShell((state) => state.locale);
  const views =
    collection.admin?.views?.filter(
      (view) =>
        view.scope === scope && !['root', 'default'].includes(view.path) && view.tab !== false,
    ) ?? [];
  if (views.length === 0 || (scope === 'document' && !document)) return null;
  const locale = editor?.locale;
  const suffix = locale ? `?locale=${encodeURIComponent(locale)}` : '';
  return (
    <nav
      aria-label={language === 'zh' ? '集合视图' : 'Collection views'}
      className="flex flex-wrap gap-2"
    >
      <Button
        variant="outline"
        onClick={() => navigation.push(`${collectionHref(collection.key, document?.id)}${suffix}`)}
      >
        {language === 'zh' ? '内容' : 'Content'}
      </Button>
      {views.map((view) => (
        <Button
          key={view.id}
          variant="outline"
          onClick={() =>
            navigation.push(`${customViewHref(collection.key, view, document?.id)}${suffix}`)
          }
        >
          {view.label}
        </Button>
      ))}
    </nav>
  );
}
export function CollectionViewPresentation({
  scope,
  path,
  optional = false,
  children,
  ...props
}: CollectionComponentProps & {
  scope: 'collection' | 'document';
  path?: string | undefined;
  optional?: boolean;
  children: ReactNode;
}) {
  const language = useShell((state) => state.locale);
  const view = props.collection.admin?.views?.find(
    (entry) => entry.scope === scope && entry.path === (path ?? 'root'),
  );
  if (!view)
    return path && !optional ? (
      <p role="alert">{language === 'zh' ? '视图不可用' : 'The view is unavailable'}</p>
    ) : (
      children
    );
  return (
    <>
      <RegisteredCollection
        {...props}
        slot="ViewActions"
        component={view.actions ?? false}
        namespace={`$view:${view.id}`}
        view={view}
      />
      <RegisteredCollection
        {...props}
        slot="View"
        component={view.component}
        namespace={`$view:${view.id}`}
        view={view}
      >
        {children}
      </RegisteredCollection>
    </>
  );
}
