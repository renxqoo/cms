import { afterEach, expect, it } from 'vitest';
import {
  createPublicFixture,
  createPublicModel,
} from '../../../../../../test/support/public-runtime.ts';
import { publicDeliveryOptions } from '../../../../../../test/support/public-content.ts';
const fixtures: Awaited<ReturnType<typeof createPublicFixture>>[] = [];
async function fixture() {
  const kit = await createPublicFixture();
  fixtures.push(kit);
  return kit;
}
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((kit) => kit.close()));
});
function grant(url: string): string {
  const value = new URL(url).searchParams.get('grant');
  if (!value) throw new Error('Missing preview grant');
  return value;
}

it('pins private previews to an exact draft revision without publishing it or storing its bearer credential', async () => {
  const kit = await fixture();
  const draft = await createPublicModel(kit, { title: 'Private first draft' }, false);
  const ticket = await kit.delivery.createPreviewTicket(kit.owner(), {
    collection: 'models',
    id: draft.id,
    locale: 'en',
    expectedRevision: draft.revision,
  });
  const bearer = grant(ticket.url);
  expect(new URL(ticket.url).origin).toBe('https://client.example.test');
  expect(bearer).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  const updated = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'models',
    id: draft.id,
    revision: draft.revision,
    data: { title: 'Private second draft' },
  });
  const preview = await kit.delivery.getPreviewModel({
    slug: 'alpha',
    locale: 'en',
    grant: bearer,
  });
  expect(preview.content.data.model.title).toBe('Private first draft');
  expect(preview.content.data.model.versionId).toBe(draft.versionId);
  expect(preview.expiresAt).toBe(ticket.expiresAt);
  expect(preview.content.data.model.seo.allowIndex).toBe(false);
  expect(preview.content.data.model.translations).toEqual([]);
  await expect(kit.delivery.getModel({ slug: 'alpha', locale: 'en' })).rejects.toMatchObject({
    code: 'not_found',
  });
  const stored = await kit.database.query('SELECT * FROM content_preview_grants');
  expect(JSON.stringify(stored.rows)).not.toContain(bearer);
  expect(updated.revision).toBeGreaterThan(draft.revision);
});

it('rejects cross-model, cross-language and altered credentials and revokes every copy immediately', async () => {
  const kit = await fixture();
  const draft = await createPublicModel(kit, {}, false);
  const ticket = await kit.delivery.createPreviewTicket(kit.owner(), {
    collection: 'models',
    id: draft.id,
    locale: 'en',
    expectedRevision: draft.revision,
  });
  const bearer = grant(ticket.url);
  await expect(
    kit.delivery.getPreviewModel({ slug: 'other', locale: 'en', grant: bearer }),
  ).rejects.toMatchObject({ code: 'unauthenticated' });
  await expect(
    kit.delivery.getPreviewModel({ slug: 'alpha', locale: 'zh', grant: bearer }),
  ).rejects.toMatchObject({ code: 'unauthenticated' });
  await expect(
    kit.delivery.getPreviewModel({ slug: 'alpha', locale: 'en', grant: `${bearer.slice(0, -1)}!` }),
  ).rejects.toMatchObject({ code: 'unauthenticated' });
  expect(await kit.delivery.revokePreview({ grant: bearer })).toEqual({ revoked: true });
  expect(await kit.delivery.revokePreview({ grant: bearer })).toEqual({ revoked: true });
  await expect(
    kit.delivery.getPreviewModel({ slug: 'alpha', locale: 'en', grant: bearer }),
  ).rejects.toMatchObject({ code: 'unauthenticated' });
});

it('checks issuer authority and expiry on every process and refuses stale draft issuance', async () => {
  const kit = await fixture();
  const draft = await createPublicModel(kit, {}, false);
  await expect(
    kit.delivery.createPreviewTicket(kit.owner(), {
      collection: 'models',
      id: draft.id,
      locale: 'en',
      expectedRevision: draft.revision + 1,
    }),
  ).rejects.toMatchObject({ code: 'version_conflict' });
  const ticket = await kit.delivery.createPreviewTicket(kit.owner(), {
    collection: 'models',
    id: draft.id,
    locale: 'en',
    expectedRevision: draft.revision,
  });
  const second = kit.content.createDelivery(publicDeliveryOptions());
  expect(
    (await second.getPreviewModel({ slug: 'alpha', locale: 'en', grant: grant(ticket.url) }))
      .content.data.model.id,
  ).toBe(draft.id);
  await second.revokePreviewTicket(kit.owner(), {
    collection: 'models',
    id: draft.id,
    ticketId: ticket.ticketId,
  });
  await expect(
    kit.delivery.getPreviewModel({ slug: 'alpha', locale: 'en', grant: grant(ticket.url) }),
  ).rejects.toMatchObject({ code: 'unauthenticated' });
  const expiring = await kit.delivery.createPreviewTicket(kit.owner(), {
    collection: 'models',
    id: draft.id,
    locale: 'en',
    expectedRevision: draft.revision,
  });
  await kit.database.query(
    "UPDATE content_preview_grants SET created_at=clock_timestamp()-interval '2 seconds',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [expiring.ticketId],
  );
  await expect(
    second.getPreviewModel({ slug: 'alpha', locale: 'en', grant: grant(expiring.url) }),
  ).rejects.toMatchObject({ code: 'unauthenticated' });
});
