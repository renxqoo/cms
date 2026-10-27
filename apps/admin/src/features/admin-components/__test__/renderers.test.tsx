import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { collectionSchema } from '../../../contracts/content';
import { documentSchema } from '../../../contracts/documents';
import { collectionEditorSchema } from '../../../contracts/editor';
import { AdminComponentsProvider, editorComponentsAvailable } from '../registry';
import { RegisteredCell, RegisteredCollection } from '../renderers';
import { CollectionPresentation } from '../collection-presentation';
import type {
  AdminComponentRegistry,
  CellComponentProps,
  CollectionComponentProps,
  FieldComponentProps,
} from '../types';

const collection = collectionSchema.parse({
  key: 'articles',
  label: 'Articles',
  schemaVersion: 1,
  mode: 'drafts',
  history: true,
  singleton: false,
  orderable: false,
  locales: ['en'],
  defaultLocale: 'en',
  defaultSort: [{ field: 'updatedAt', order: 'desc' }],
  dataSchema: {},
  fields: [
    {
      id: 'slug',
      path: 'slug',
      type: 'text',
      label: 'Slug',
      required: false,
      localized: false,
      queryable: true,
      sortable: true,
      components: { Cell: 'site/cell' },
    },
  ],
  behaviorHash: 'behavior',
  mappingFingerprint: 'mapping',
  upload: false,
  drafts: { validate: true, autosave: { intervalMs: 10000 }, schedule: true },
  capabilities: {
    autosave: true,
    publication: true,
    schedules: true,
    history: true,
    trash: true,
    purge: true,
  },
  componentVersions: {
    'site/cell': '1',
    'site/header': '1',
    'site/list': '1',
    'site/before': '1',
    'site/after': '1',
  },
  admin: {
    components: {
      Header: 'site/header',
      List: 'site/list',
      beforeList: ['site/before'],
      afterList: ['site/after'],
    },
  },
});
const document = documentSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  collection: 'articles',
  revision: 1,
  versionId: '22222222-2222-4222-8222-222222222222',
  publishedVersionId: null,
  trashedAt: null,
  folderId: null,
  createdAt: '2026-10-26T01:00:00.000Z',
  updatedAt: '2026-10-26T01:00:00.000Z',
  data: { slug: 'public' },
});
function Cell({ text, document: row }: CellComponentProps) {
  return (
    <strong>
      {row.revision}: {text.toUpperCase()}
    </strong>
  );
}
function Header({ collection: item }: CollectionComponentProps) {
  return <h2>Custom {item.label}</h2>;
}
function List({ children }: CollectionComponentProps) {
  return <article aria-label="Custom list">{children}</article>;
}
function Before() {
  return <p>Before list</p>;
}
function After() {
  return <p>After list</p>;
}
function Input({ children }: FieldComponentProps) {
  return children;
}
const registry: AdminComponentRegistry = {
  versions: {
    'site/cell': '1',
    'site/header': '1',
    'site/list': '1',
    'site/before': '1',
    'site/after': '1',
    'site/input': '1',
  },
  fields: { Field: { 'site/input': Input } },
  cells: { 'site/cell': Cell },
  collections: {
    Header: { 'site/header': Header },
    List: { 'site/list': List },
    beforeList: { 'site/before': Before },
    afterList: { 'site/after': After },
  },
};
function Wrap({ children }: { children: ReactNode }) {
  return (
    <ShellProvider
      initial={{ locale: 'en', theme: 'light', sidebarOpen: true, collapsedGroups: [] }}
    >
      <AdminComponentsProvider registry={registry}>{children}</AdminComponentsProvider>
    </ShellProvider>
  );
}

it('registered list, header, before/after hooks and cells receive the real projected document context', () => {
  const [field] = collection.fields;
  if (!field) throw new Error('Missing field');
  render(
    <Wrap>
      <CollectionPresentation
        kind="list"
        collection={collection}
        document={null}
        editor={null}
        readOnly
      >
        <RegisteredCollection
          slot="Header"
          collection={collection}
          document={null}
          editor={null}
          readOnly
        >
          <h1>Default header</h1>
        </RegisteredCollection>
        <RegisteredCell
          collection={collection}
          document={document}
          field={field}
          text="public"
          value="public"
        >
          <small>Default cell</small>
        </RegisteredCell>
      </CollectionPresentation>
    </Wrap>,
  );
  expect(screen.getByRole('article', { name: 'Custom list' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Custom Articles' })).toBeVisible();
  expect(screen.getByText('Before list')).toBeVisible();
  expect(screen.getByText('After list')).toBeVisible();
  expect(screen.getByText('1: PUBLIC')).toBeVisible();
  expect(screen.queryByText('Default header')).not.toBeInTheDocument();
  expect(screen.queryByText('Default cell')).not.toBeInTheDocument();
});

it('a client/server component version mismatch renders an explicit error and retains the default value', () => {
  const [field] = collection.fields;
  if (!field) throw new Error('Missing field');
  render(
    <Wrap>
      <RegisteredCell
        collection={{ ...collection, componentVersions: { 'site/cell': '2' } }}
        document={document}
        field={field}
        text="public"
        value="public"
      >
        <small>Retained public cell</small>
      </RegisteredCell>
    </Wrap>,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('custom component is unavailable');
  expect(screen.getByText('Retained public cell')).toBeVisible();
});

it('editor loading rejects missing, unknown and mismatched component versions before it can submit a form', () => {
  const editor = collectionEditorSchema.parse({
    collection: 'articles',
    schemaVersion: 1,
    behaviorHash: 'behavior',
    mappingFingerprint: 'mapping',
    intent: 'create',
    mode: 'editing',
    locale: 'en',
    fallback: [],
    richTextNodes: [],
    document: null,
    locales: { default: 'en', supported: ['en'], fallback: {} },
    initialData: {},
    initialSnapshot: null,
    visibility: {},
    componentVersions: { 'site/input': '1' },
    layout: [
      {
        id: 'title',
        name: 'title',
        label: 'Title',
        type: 'text',
        required: false,
        localized: false,
        write: 'allowed',
        constraints: {},
        components: { Field: 'site/input' },
      },
    ],
    schemas: { read: {}, draft: {}, commit: {} },
    actions: [],
    upload: null,
  });
  const { admin: _admin, ...plain } = collection;
  const inherited = {
    ...editor,
    componentVersions: { constructor: '1' },
    layout: editor.layout.map((node) => ({ ...node, components: { Field: 'constructor' } })),
  };
  expect(
    editorComponentsAvailable(plain, inherited, {
      ...registry,
      versions: { constructor: '1' },
      fields: { Field: {} },
    }),
  ).toBe(false);
  expect(editorComponentsAvailable(plain, editor, registry)).toBe(true);
  expect(
    editorComponentsAvailable(
      plain,
      { ...editor, componentVersions: {} },
      { ...registry, versions: {} },
    ),
  ).toBe(false);
  expect(editorComponentsAvailable(plain, { ...editor, componentVersions: {} }, registry)).toBe(
    false,
  );
  expect(
    editorComponentsAvailable(
      plain,
      { ...editor, componentVersions: { 'site/input': '2' } },
      registry,
    ),
  ).toBe(false);
  expect(
    editorComponentsAvailable(
      plain,
      { ...editor, componentVersions: { 'site/unknown': '1' } },
      registry,
    ),
  ).toBe(false);
});

function configuredEditor(layout: unknown) {
  return collectionEditorSchema.parse({
    collection: 'articles',
    schemaVersion: 1,
    behaviorHash: 'behavior',
    mappingFingerprint: 'mapping',
    intent: 'update',
    mode: 'editing',
    locale: 'en',
    fallback: [],
    richTextNodes: [],
    document: null,
    locales: { default: 'en', supported: ['en'], fallback: {} },
    initialData: null,
    initialSnapshot: null,
    visibility: {},
    componentVersions: { 'site/input': '1', 'site/cell': '1' },
    layout,
    schemas: { read: {}, draft: {}, commit: {} },
    actions: [],
    upload: null,
  });
}
it('all nested tab, block and cell components must be available before an editor is enabled', () => {
  const field = {
    id: 'title',
    name: 'title',
    type: 'text',
    label: 'Title',
    required: false,
    localized: false,
    write: 'allowed',
    constraints: {},
    components: { Field: 'site/input', Cell: 'site/cell' },
  };
  const editor = configuredEditor([
    {
      ...field,
      id: 'group',
      type: 'group',
      components: {},
      children: [field],
      tabs: [{ id: 'tab', label: 'Tab', children: [field] }],
      blocks: [
        {
          id: 'block',
          key: 'block',
          label: 'Block',
          components: { Block: 'site/input' },
          children: [field],
        },
      ],
    },
  ]);
  const plain = { ...collection, admin: undefined };
  expect(editorComponentsAvailable(plain, editor, registry)).toBe(false);
  const complete = { ...registry, fields: { ...registry.fields, Block: { 'site/input': Input } } };
  expect(editorComponentsAvailable(plain, editor, complete)).toBe(true);
  expect(editorComponentsAvailable(plain, editor, { ...complete, cells: {} })).toBe(false);
  expect(
    editorComponentsAvailable(plain, editor, {
      ...complete,
      fields: { Block: { 'site/input': Input } },
    }),
  ).toBe(false);
});
it('custom view and hierarchy icon registrations are required even when versions match', () => {
  const editor = configuredEditor([]);
  editor.componentVersions = { 'site/header': '1' };
  const value = collectionSchema.parse({
    ...collection,
    admin: {
      views: [
        {
          id: 'report',
          scope: 'collection',
          path: 'report',
          label: 'Report',
          component: 'site/header',
        },
      ],
    },
    hierarchy: {
      kind: 'hierarchy',
      parentFieldName: 'parent',
      allowHasMany: false,
      treeLimit: 20,
      useHeaderButton: true,
      injectSidebarTab: true,
      relatedCollections: [],
      components: { Icon: 'site/header' },
    },
  });
  expect(editorComponentsAvailable(value, editor, registry)).toBe(false);
  expect(
    editorComponentsAvailable(value, editor, {
      ...registry,
      collections: { View: { 'site/header': Header }, Icon: { 'site/header': Header } },
    }),
  ).toBe(true);
});
it('a failed registered component keeps normal content and can retry successfully', async () => {
  const user = userEvent.setup();
  let failing = true;
  function Recoverable({ children }: CollectionComponentProps) {
    if (failing) throw new Error('Temporary render failure');
    return <section>Recovered{children}</section>;
  }
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    render(
      <Wrap>
        <AdminComponentsProvider
          registry={{ ...registry, collections: { Header: { 'site/header': Recoverable } } }}
        >
          <RegisteredCollection
            collection={collection}
            document={document}
            editor={null}
            slot="Header"
            readOnly
          >
            <p>Retained form</p>
          </RegisteredCollection>
        </AdminComponentsProvider>
      </Wrap>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('The custom component is unavailable');
    expect(screen.getByText('Retained form')).toBeVisible();
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByText('Recovered')).toBeVisible();
    expect(screen.getByText('Retained form')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  } finally {
    logged.mockRestore();
  }
});
