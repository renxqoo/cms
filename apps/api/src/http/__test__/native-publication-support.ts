import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { contentOperations } from '@new-cms/cms/content';
import { api } from './support.ts';
import type { HttpFixture } from './support.ts';

export async function bindPublicCollections(kit: HttpFixture, collections: readonly string[]) {
  const context = () => ({
    requestId: randomUUID(),
    ip: '127.0.0.1',
    token: kit.token,
    idempotencyKey: randomUUID(),
  });
  for (const collectionKey of collections) {
    const permission = await kit.runtime.access.api.createPermission(context(), {
      code: `native:${collectionKey}:manage`,
      name: `Manage native ${collectionKey}`,
      scopeKind: 'collection',
      collectionKey,
    });
    for (const operation of contentOperations.filter((item) => item.scopeKind === 'collection'))
      await kit.runtime.access.api.createBinding(context(), {
        operationId: operation.id,
        scopeKind: 'collection',
        collectionKey,
        permissionId: permission.id,
      });
  }
}
const identity = z.object({ id: z.uuid(), revision: z.number() });
export async function publishNative(kit: HttpFixture, collection: string, data: unknown) {
  const request = api(kit);
  const created = await request('POST', `/v1/collections/${collection}/documents`, {
    body: { locale: 'en', data },
  });
  if (created.status !== 201)
    throw new Error(
      `Native ${collection} create failed: ${created.status} ${await created.text()}`,
    );
  const document = identity.parse(await created.json());
  const published = await request(
    'POST',
    `/v1/collections/${collection}/documents/${document.id}/publications`,
    { body: { revision: document.revision, locale: 'en' } },
  );
  if (published.status !== 200)
    throw new Error(
      `Native ${collection} publish failed: ${published.status} ${await published.text()}`,
    );
  return identity.parse(await published.json());
}

export {
  editorialFixture,
  nativeDocument,
} from '../../../../../test/support/oneaster-editorial.ts';
