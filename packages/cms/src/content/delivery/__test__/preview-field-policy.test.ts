import { afterEach, expect, it } from 'vitest';
import type { FieldDefinition, FieldPolicy } from '../../definition.ts';
import {
  createContentMediaFixture,
  mediaCollections,
  readyContentUpload,
} from '../../../../../../test/support/content-media-runtime.ts';
import { contentActor } from '../../../../../../test/support/content-actor.ts';
import {
  publicCollections,
  publicDeliveryOptions,
} from '../../../../../../test/support/public-content.ts';
import {
  createPublicModel,
  initializePublicFixture,
} from '../../../../../../test/support/public-runtime.ts';

const resources: { close(): Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(resources.splice(0).map((kit) => kit.close()));
});
function policyFields(
  fields: readonly FieldDefinition[],
  input: { path: string; run: FieldPolicy['run']; prefix?: string },
): FieldDefinition[] {
  return fields.map((field) => {
    const path = input.prefix ? `${input.prefix}.${field.name}` : String(field.name);
    return {
      ...field,
      ...(path === input.path
        ? { access: { ...field.access, read: { version: 'preview-policy.v1', run: input.run } } }
        : {}),
      ...(field.fields ? { fields: policyFields(field.fields, { ...input, prefix: path }) } : {}),
    };
  });
}
async function fixture(path: string, run: FieldPolicy['run'] = () => false) {
  const collections = publicCollections();
  const models = collections.find((collection) => collection.key === 'models');
  const site = collections.find((collection) => collection.key === 'site');
  const media = mediaCollections().find((collection) => collection.key === 'media');
  if (!models || !site || !media) throw new Error('Missing policy fixture collection');
  models.fields = models.fields.map((field) =>
    field.name === 'apiBindings'
      ? {
          ...field,
          fields: [
            ...(field.fields ?? []),
            { id: 'recipes', name: 'recipeKeys', type: 'json' },
            { id: 'default_scenario', name: 'defaultScenarioKey', type: 'text' },
            { id: 'scenarios', name: 'scenarios', type: 'json' },
          ],
        }
      : field,
  );
  models.fields = policyFields(
    [
      ...models.fields,
      { id: 'logo', name: 'logo', type: 'upload', relationTo: ['media'] },
      { id: 'internal_note', name: 'internalNote', type: 'text' },
    ],
    { path, run },
  );
  site.fields = [...site.fields, { id: 'api_base_url', name: 'apiBaseUrl', type: 'text' }];
  collections.push(media);
  const kit = await createContentMediaFixture({ collections });
  resources.push(kit);
  await initializePublicFixture(kit);
  return { ...kit, delivery: kit.content.createDelivery(publicDeliveryOptions()) };
}
function bearer(url: string) {
  const value = new URL(url).searchParams.get('grant');
  if (!value) throw new Error('Missing preview credential');
  return value;
}
function issue(
  kit: Awaited<ReturnType<typeof fixture>>,
  draft: { id: string; revision: number },
  ctx = kit.owner(),
) {
  return kit.delivery.createPreviewTicket(ctx, {
    collection: 'models',
    id: draft.id,
    locale: 'en',
    expectedRevision: draft.revision,
  });
}
it.each(['title', 'slug', 'seo'])(
  'never issues a preview exposing the actual hidden %s field or its derived metadata',
  async (path) => {
    const kit = await fixture(path);
    const draft = await createPublicModel(
      kit,
      { title: 'Protected unreleased model title', seo: { allowIndex: true } },
      false,
    );
    const ordinary = await kit.content.api.getDocument(kit.owner(), {
      collection: 'models',
      id: draft.id,
      locale: 'en',
    });
    expect(ordinary.data[path]).toBeUndefined();
    await expect(issue(kit, draft)).rejects.toMatchObject({ code: 'forbidden' });
    const tickets = await kit.database.query('SELECT id FROM content_preview_grants');
    expect(tickets.rows).toEqual([]);
  },
);
it('does not block a complete preview because a hidden optional field has no actual stored value', async () => {
  const kit = await fixture('internalNote');
  const draft = await createPublicModel(kit, {}, false);
  const ticket = await issue(kit, draft);
  const preview = await kit.delivery.getPreviewModel({
    slug: 'alpha',
    locale: 'en',
    grant: bearer(ticket.url),
  });
  expect(preview.content.data.model.title).toBe('Published Alpha');
  expect(preview.content.data.model).not.toHaveProperty('internalNote');
});
it('normal published anonymous model and metadata contracts do not inherit issuer field policies', async () => {
  const kit = await fixture('title');
  await createPublicModel(kit, { title: 'Published public title' });
  const result = await kit.delivery.getModel({ slug: 'alpha', locale: 'en' });
  expect(result.data.model.title).toBe('Published public title');
  expect(result.data.model.seo.title).toBe('Published public title');
});
async function linkedDraft(kit: Awaited<ReturnType<typeof fixture>>) {
  const upload = await readyContentUpload(kit);
  const media = await kit.content.api.createDocument(kit.owner(), {
    collection: 'media',
    uploadId: upload.uploadId,
    data: { title: 'Private original' },
  });
  const site = await kit.content.api.createDocument(kit.owner(), {
    collection: 'site',
    data: { title: 'Site', contentLocales: ['en'], apiBaseUrl: 'https://api.example.test/v1' },
  });
  await kit.content.api.publishDocument(kit.owner(), {
    collection: 'site',
    id: site.id,
    revision: site.revision,
  });
  return createPublicModel(
    kit,
    {
      logo: { collection: 'media', id: media.id },
      apiBindings: [
        {
          key: 'chat',
          profileKey: 'core.chat',
          recipeKeys: ['core.http'],
          defaultScenarioKey: 'basic',
          scenarios: [
            {
              key: 'basic',
              title: 'Draft example',
              description: 'Private recipe',
              flowKey: 'chat.json',
              requestValues: {
                messages: [{ role: 'user', content: 'Protected draft prompt' }],
                max_tokens: 8,
              },
            },
          ],
        },
      ],
      defaultBindingKey: 'chat',
    },
    false,
  );
}
it.each(['title', 'apiBindings.profileKey', 'logo'] as const)(
  'current issuer policy revocation for %s rejects the fixed grant model, code and private media',
  async (path) => {
    const kit = await fixture(path, ({ actor }) => actor.role.name !== 'Restricted reader');
    const draft = await linkedDraft(kit);
    const editor = await contentActor(kit, [
      'models:documents.get',
      'models:documents.createPreviewTicket',
    ]);
    const ticket = await issue(kit, draft, editor.ctx());
    const grant = bearer(ticket.url);
    const input = { slug: 'alpha', locale: 'en', grant };
    const first = await kit.delivery.getPreviewModel(input);
    const { logo } = first.content.data.model;
    if (!logo) throw new Error('Missing private binding');
    const { bindingId } = logo;
    const examples = await kit.delivery.getPreviewIntegrations(input);
    expect(examples.content.data.examples).toHaveLength(7);
    expect(examples.content.data.modelId).toBe('business-exact-key');
    expect(examples.content.data.agentInstructions).toContain('Private recipe');
    const file = await kit.delivery.getPreviewMedia({ bindingId, grant });
    expect(new TextDecoder().decode(await new Response(file.stream).arrayBuffer())).toContain(
      'private original bytes',
    );
    await kit.access.api.updateRole(kit.owner(), {
      id: editor.role.id,
      version: editor.role.version,
      name: 'Restricted reader',
    });
    const ordinary = await kit.content.api.getDocument(editor.ctx(), {
      collection: 'models',
      id: draft.id,
      locale: 'en',
    });
    expect(ordinary.id).toBe(draft.id);
    const protectedValues = {
      title: 'Published Alpha',
      'apiBindings.profileKey': 'core.chat',
      logo: logo.mediaDocumentId,
    };
    expect(JSON.stringify(ordinary.data)).not.toContain(protectedValues[path]);
    const results = await Promise.allSettled([
      kit.delivery.getPreviewModel(input),
      kit.delivery.getPreviewIntegrations(input),
      kit.delivery
        .getPreviewMedia({ bindingId, grant })
        .then((download) => download.stream.cancel()),
    ]);
    for (const result of results)
      expect(result).toMatchObject({ status: 'rejected', reason: { code: 'unauthenticated' } });
  },
);
