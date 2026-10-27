import { afterEach, expect, it } from 'vitest';
import { createContentFixture } from '../../../../../../test/support/content-runtime.ts';
import {
  createPublicModel,
  initializePublicFixture,
} from '../../../../../../test/support/public-runtime.ts';
import {
  publicCollections,
  publicDeliveryOptions,
} from '../../../../../../test/support/public-content.ts';
import type { CollectionHooks } from '../../definition.ts';

const fixtures: Awaited<ReturnType<typeof createContentFixture>>[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((item) => item.close()));
});
async function fixture(hooks: CollectionHooks) {
  const collections = publicCollections();
  const models = collections.find((collection) => collection.key === 'models');
  if (!models) throw new Error('Missing model fixture');
  models.hooks = hooks;
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  await initializePublicFixture(kit);
  const delivery = kit.content.createDelivery(publicDeliveryOptions());
  const draft = await createPublicModel(kit, {}, false);
  const ticket = await delivery.createPreviewTicket(kit.owner(), {
    collection: 'models',
    id: draft.id,
    locale: 'en',
    expectedRevision: draft.revision,
  });
  const grant = new URL(ticket.url).searchParams.get('grant');
  if (!grant) throw new Error('Missing preview grant');
  return { ...kit, delivery, input: { locale: 'en', slug: 'alpha', grant } };
}

it('regression: private delivery previews await beforeRead and recheck the issuer through its current predicate', async () => {
  let readable = true;
  const kit = await fixture({
    beforeRead: [
      {
        version: 'current',
        run: () =>
          Promise.resolve(
            readable ? undefined : { field: 'modelId', operator: 'eq', value: 'not-visible' },
          ),
      },
    ],
  });
  expect((await kit.delivery.getPreviewModel(kit.input)).content.data.model.slug).toBe('alpha');
  readable = false;
  await expect(kit.delivery.getPreviewModel(kit.input)).rejects.toMatchObject({
    code: 'unauthenticated',
  });
  await expect(kit.delivery.revokePreview({ grant: kit.input.grant })).rejects.toMatchObject({
    code: 'unauthenticated',
  });
  readable = true;
  expect((await kit.delivery.getPreviewModel(kit.input)).content.data.model.slug).toBe('alpha');
});

it('cancelling a waiting private preview aborts its hook and releases the read transaction', async () => {
  const entered = Promise.withResolvers<void>();
  let waiting = false;
  let hookSignal: AbortSignal | undefined;
  const kit = await fixture({
    beforeRead: [
      {
        version: 'cancel',
        run: ({ signal }) =>
          waiting
            ? new Promise(() => {
                hookSignal = signal;
                entered.resolve();
              })
            : undefined,
      },
    ],
  });
  waiting = true;
  const controller = new AbortController();
  const running = kit.delivery
    .getPreviewModel(kit.input, controller.signal)
    .catch((error: unknown) => error);
  await entered.promise;
  controller.abort();
  expect(await running).toMatchObject({ code: 'temporarily_unavailable' });
  expect(hookSignal?.aborted).toBe(true);
  waiting = false;
  expect((await kit.delivery.getPreviewModel(kit.input)).content.data.model.slug).toBe('alpha');
});
