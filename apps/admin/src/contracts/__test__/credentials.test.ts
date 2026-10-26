import { expect, it } from 'vitest';
import { credentialGrantSchema } from '../credentials';

it.each([
  ['global', null, true],
  ['global', 'articles', false],
  ['collection', 'articles', true],
  ['collection', null, false],
  ['collection', '', false],
])(
  'validates a %s grant with collection %s against the public scope contract',
  (scopeKind, collectionKey, valid) => {
    expect(
      credentialGrantSchema.safeParse({ operationId: 'documents.get', scopeKind, collectionKey })
        .success,
    ).toBe(valid);
  },
);
