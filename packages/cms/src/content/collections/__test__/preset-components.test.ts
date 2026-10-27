import { expect, it } from 'vitest';
import { createRegistry } from '../../generate.ts';
import {
  contentCollection,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import { contentLimits } from '../../../../../../test/support/content.ts';
import type { FieldDefinition } from '../../definition.ts';
import type { AdminComponentRegistration } from '../admin-types.ts';

function configured(action: 'read' | 'update' | 'delete', fields: FieldDefinition[]) {
  const collections = workflowCollections();
  contentCollection(collections, 'articles').queryPresetConstraints = {
    [action]: [
      { value: 'custom', label: 'Custom', fields, access: { version: '1', run: () => true } },
    ],
  };
  return collections;
}
function parameter(): FieldDefinition {
  return {
    id: 'parameter',
    name: 'parameter',
    type: 'text',
    admin: { components: { Field: 'parameters/control' } },
  };
}
it.each(['read', 'update', 'delete'] as const)(
  'regression: unknown %s preset parameter renderers fail during registry creation',
  (action) => {
    expect(() =>
      createRegistry({ collections: configured(action, [parameter()]), limits: contentLimits() }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_input' }));
  },
);
it('regression: preset block renderers require the registered Block slot', () => {
  const field: FieldDefinition = {
    id: 'cards',
    name: 'cards',
    type: 'blocks',
    blocks: [
      {
        id: 'card',
        key: 'card',
        label: 'Card',
        admin: { components: { Block: 'parameters/control' } },
        fields: [{ id: 'note', name: 'note', type: 'text' }],
      },
    ],
  };
  const register = (slots: AdminComponentRegistration['slots']) =>
    createRegistry({
      collections: configured('read', [field]),
      limits: contentLimits(),
      adminComponents: [{ id: 'parameters/control', version: '1', slots }],
    });
  expect(() => register(['Field'])).toThrowError(
    expect.objectContaining({ code: 'invalid_input' }),
  );
  expect(() => register(['Block'])).not.toThrow();
});
it('accepts registered parameter field renderers without requiring a content document', () => {
  expect(() =>
    createRegistry({
      collections: configured('update', [parameter()]),
      limits: contentLimits(),
      adminComponents: [{ id: 'parameters/control', version: '1', slots: ['Field'] }],
    }),
  ).not.toThrow();
});
