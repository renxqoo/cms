import { expect, it } from 'vitest';
import { createRegistry } from '../../generate.ts';
import {
  contentCollection,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import { contentLimits } from '../../../../../../test/support/content.ts';
import type { FieldDefinition } from '../../definition.ts';

it.each<FieldDefinition>([
  { id: 'setting', name: 'setting', type: 'text', localized: true },
  { id: 'setting', name: 'setting', type: 'text', virtual: true },
  { id: 'setting', name: 'setting', type: 'join', join: { collection: 'pages', field: 'author' } },
])(
  'rejects unsupported preset parameter semantics at configuration time: $type $localized $virtual',
  (field) => {
    const collections = workflowCollections();
    contentCollection(collections, 'articles').queryPresetConstraints = {
      read: [
        {
          value: 'custom',
          label: 'Custom',
          fields: [field],
          access: { version: '1', run: () => true },
        },
      ],
    };
    expect(() => createRegistry({ collections, limits: contentLimits() })).toThrowError(
      expect.objectContaining({ code: 'invalid_input' }),
    );
  },
);
