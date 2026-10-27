import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Collection } from '../../../contracts/content';
import { collection, record, descriptor } from './page-fixture';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { AdminComponentsProvider } from '../../admin-components/registry';
import type {
  AdminComponentRegistry,
  CollectionComponentProps,
  FieldComponentProps,
} from '../../admin-components/types';
import { CollectionViewNavigation, CollectionViewPresentation } from '../custom-views';
import { CollectionIcon } from '../list-customization';
import { UiFieldFilters } from '../ui-field-filters';
import { parseDocumentQuery } from '../query';
import type { DocumentQuery } from '../query';
const navigation = vi.hoisted(() => ({ push: vi.fn<(href: string) => void>() }));
vi.mock('../../../components/shell/navigation/provider', () => ({
  useAppNavigation: () => navigation,
}));
function Content({ customProps, children }: CollectionComponentProps) {
  return (
    <section aria-label="Registered view">
      {typeof customProps?.['caption'] === 'string' ? customProps['caption'] : 'No caption'}
      {children}
    </section>
  );
}
function Icon() {
  return <span>Collection icon</span>;
}
function TreeIcon() {
  return <span>Tree icon</span>;
}
function Filter({ onChange, customProps }: FieldComponentProps) {
  return (
    <div>
      <p>{typeof customProps?.['caption'] === 'string' ? customProps['caption'] : 'Missing'}</p>
      <button onClick={() => onChange({ operator: 'eq', field: 'title', value: 'Allowed' })}>
        Filter allowed
      </button>
      <button onClick={() => onChange({ operator: 'eq', field: 'hidden', value: 'Private' })}>
        Invalid filter
      </button>
      <button onClick={() => onChange(null)}>Clear filter</button>
    </div>
  );
}
const registry: AdminComponentRegistry = {
  versions: { 'site/view': '1', 'site/filter': '1', 'site/icon': '1', 'site/tree': '1' },
  fields: { Filter: { 'site/filter': Filter } },
  cells: {},
  collections: {
    View: { 'site/view': Content },
    ViewActions: { 'site/view': Content },
    Icon: { 'site/icon': Icon, 'site/tree': TreeIcon },
  },
};
function Wrap({ children }: { children: ReactNode }) {
  return (
    <ShellProvider
      initial={{ locale: 'en', theme: 'dark', sidebarOpen: true, collapsedGroups: [] }}
    >
      <AdminComponentsProvider registry={registry}>{children}</AdminComponentsProvider>
    </ShellProvider>
  );
}
const configured: Collection = {
  ...collection,
  componentVersions: registry.versions,
  componentProps: {
    '$view:report:View:site/view': { caption: 'Authorized report' },
    '$view:report:ViewActions:site/view:0': { caption: 'Report action' },
  },
  admin: {
    components: { Icon: 'site/icon' },
    views: [
      {
        id: 'report',
        scope: 'document' as const,
        path: 'report/summary',
        label: 'Report',
        component: 'site/view',
        actions: ['site/view'],
      },
      {
        id: 'hidden-tab',
        scope: 'document' as const,
        path: 'hidden',
        label: 'Hidden',
        component: 'site/view',
        tab: false,
      },
      {
        id: 'root',
        scope: 'document' as const,
        path: 'root',
        label: 'Root',
        component: 'site/view',
      },
    ],
  },
};
it('registered custom views consume authorized props, actions, nested paths and explicit navigation tabs', async () => {
  const user = userEvent.setup();
  const document = record();
  const editor = descriptor(document, {
    locale: 'zh',
    componentVersions: registry.versions,
    componentProps: configured.componentProps,
  });
  render(
    <Wrap>
      <CollectionViewNavigation
        collection={configured}
        document={document}
        editor={editor}
        readOnly={false}
        scope="document"
      />
      <CollectionViewPresentation
        collection={configured}
        document={document}
        editor={editor}
        readOnly={false}
        scope="document"
        path="report/summary"
      >
        <p>Retained contents</p>
      </CollectionViewPresentation>
    </Wrap>,
  );
  expect(screen.getByText('Authorized report')).toBeVisible();
  expect(screen.getByText('Report action')).toBeVisible();
  expect(screen.getByText('Retained contents')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Hidden' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Root' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Report' }));
  expect(navigation.push).toHaveBeenLastCalledWith(
    `/dashboard/collections/articles/${document.id}/views/report/summary?locale=zh`,
  );
  await user.click(screen.getByRole('button', { name: 'Content' }));
  expect(navigation.push).toHaveBeenLastCalledWith(
    `/dashboard/collections/articles/${document.id}?locale=zh`,
  );
});
it('missing explicit custom views fail visibly while optional views retain the normal content', () => {
  const view = render(
    <Wrap>
      <CollectionViewPresentation
        collection={configured}
        document={null}
        editor={null}
        readOnly
        scope="collection"
        path="missing"
      >
        <p>Normal content</p>
      </CollectionViewPresentation>
    </Wrap>,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('The view is unavailable');
  view.rerender(
    <Wrap>
      <CollectionViewPresentation
        collection={configured}
        document={null}
        editor={null}
        readOnly
        scope="collection"
        path="missing"
        optional
      >
        <p>Normal content</p>
      </CollectionViewPresentation>
    </Wrap>,
  );
  expect(screen.getByText('Normal content')).toBeVisible();
});
it('collection and hierarchy icons have distinct registered configuration and false disables only its own scope', () => {
  const value = {
    ...configured,
    hierarchy: {
      kind: 'hierarchy' as const,
      parentFieldName: 'parent',
      allowHasMany: false,
      treeLimit: 20,
      useHeaderButton: true,
      injectSidebarTab: true,
      relatedCollections: [],
      components: { Icon: 'site/tree' },
    },
  };
  const view = render(
    <Wrap>
      <CollectionIcon collection={value} />
      <CollectionIcon collection={value} hierarchy />
    </Wrap>,
  );
  expect(screen.getByText('Collection icon')).toBeVisible();
  expect(screen.getByText('Tree icon')).toBeVisible();
  view.rerender(
    <Wrap>
      <CollectionIcon
        collection={{ ...value, admin: { ...value.admin, components: { Icon: false } } }}
      />
      <CollectionIcon collection={value} hierarchy />
    </Wrap>,
  );
  expect(screen.queryByText('Collection icon')).not.toBeInTheDocument();
  expect(screen.getByText('Tree icon')).toBeVisible();
});
it('UI-only custom filters validate a complete query and preserve it on invalid or disabled controls', async () => {
  const user = userEvent.setup();
  const change = vi.fn<(patch: Partial<DocumentQuery>) => void>();
  const value = {
    ...collection,
    componentVersions: registry.versions,
    componentProps: { 'reporter#reporter:Filter:site/filter': { caption: 'Authorized filter' } },
    fields: [
      ...collection.fields,
      {
        id: 'reporter',
        path: 'reporter',
        label: 'Reporter',
        type: 'ui',
        required: false,
        localized: false,
        queryable: false,
        sortable: false,
        components: { Filter: 'site/filter' },
      },
    ],
  };
  const query = parseDocumentQuery(new URLSearchParams(), collection);
  const view = render(
    <Wrap>
      <UiFieldFilters collection={value} query={query} change={change} />
    </Wrap>,
  );
  expect(screen.getByText('Authorized filter')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Filter allowed' }));
  expect(change).toHaveBeenLastCalledWith({
    where: JSON.stringify({ operator: 'eq', field: 'title', value: 'Allowed' }),
  });
  await user.click(screen.getByRole('button', { name: 'Invalid filter' }));
  expect(change).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent(
    'Check the fields, comparisons and values before applying.',
  );
  await user.click(screen.getByRole('button', { name: 'Clear filter' }));
  expect(change).toHaveBeenLastCalledWith({ where: '' });
  view.rerender(
    <Wrap>
      <UiFieldFilters
        collection={{
          ...value,
          fields: value.fields.map((field) => ({
            ...field,
            disabled: { field: false, column: false, filter: true, bulkEdit: false },
          })),
        }}
        query={query}
        change={change}
      />
    </Wrap>,
  );
  expect(screen.queryByRole('button', { name: 'Filter allowed' })).not.toBeInTheDocument();
});
