import { expect, it } from 'vitest';
import { workflowCollections } from '../../../../../../test/support/content-runtime.ts';
import { createRegistry, generateArtifacts } from '../../generate.ts';
import { contentLimits } from '../../../../../../test/support/content.ts';
import { article, fixture, node } from './support.ts';
import type { AdminComponentRegistration } from '../../collections/admin-types.ts';

const registrations: AdminComponentRegistration[] = [
  {
    id: 'site/title',
    version: '1',
    slots: ['Field', 'Label', 'Description', 'Error', 'beforeInput', 'afterInput', 'Cell'],
  },
  { id: 'site/view', version: '1', slots: ['Header', 'List', 'Edit', 'beforeList', 'afterEdit'] },
];

it('projects registered field, cell and collection component identifiers through the real metadata APIs', async () => {
  const collections = workflowCollections();
  const definition = article(collections);
  definition.admin = {
    components: { Header: 'site/view', Edit: 'site/view', beforeList: ['site/view'] },
  };
  definition.fields = definition.fields.map((field) =>
    field.name === 'title'
      ? {
          ...field,
          admin: {
            components: {
              Field: 'site/title',
              Label: 'site/title',
              Description: 'site/title',
              Error: 'site/title',
              beforeInput: ['site/title'],
              afterInput: ['site/title'],
              Cell: 'site/title',
            },
          },
        }
      : field,
  );
  const kit = await fixture(collections, { adminComponents: registrations });
  const editor = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    intent: 'create',
    mode: 'editing',
  });
  expect(node(editor.layout, 'title').components).toEqual({
    Field: 'site/title',
    Label: 'site/title',
    Description: 'site/title',
    Error: 'site/title',
    beforeInput: ['site/title'],
    afterInput: ['site/title'],
    Cell: 'site/title',
  });
  const metadata = await kit.content.api.getCollection(kit.owner(), { collection: 'articles' });
  expect(metadata.admin?.components).toEqual(definition.admin.components);
  expect(metadata.fields.find((field) => field.path === 'title')?.components).toEqual({
    Cell: 'site/title',
  });
});

it('rejects unknown component identifiers, wrong slots, duplicate registrations at configuration time', () => {
  const collections = workflowCollections();
  const definition = article(collections);
  definition.fields = definition.fields.map((field) =>
    field.name === 'title' ? { ...field, admin: { components: { Field: 'site/title' } } } : field,
  );
  expect(() => createRegistry({ collections, limits: contentLimits() })).toThrowError(
    'invalid input',
  );
  expect(() =>
    createRegistry({
      collections,
      limits: contentLimits(),
      adminComponents: [{ id: 'site/title', version: '1', slots: ['Cell'] }],
    }),
  ).toThrowError('invalid input');
  expect(() =>
    createRegistry({
      collections,
      limits: contentLimits(),
      adminComponents: [...registrations, ...registrations],
    }),
  ).toThrowError('invalid input');
});

it('component versions change deployment behavior without changing the content storage schema', () => {
  const collections = workflowCollections();
  const definition = article(collections);
  definition.fields = definition.fields.map((field) =>
    field.name === 'title' ? { ...field, admin: { components: { Field: 'site/title' } } } : field,
  );
  const first = createRegistry({
    collections,
    limits: contentLimits(),
    adminComponents: registrations,
  });
  const next = createRegistry({
    collections,
    limits: contentLimits(),
    adminComponents: registrations.map((registration) => ({ ...registration, version: '2' })),
  });
  expect(first.behaviorHash).not.toBe(next.behaviorHash);
  expect(generateArtifacts(first).mapping.fingerprint).toBe(
    generateArtifacts(next).mapping.fingerprint,
  );
});
