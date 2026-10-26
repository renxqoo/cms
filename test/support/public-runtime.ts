import { createContentFixture } from './content-runtime.ts';
import type { ContentFixture } from './content-runtime.ts';
import { publicCollections, publicDeliveryOptions } from './public-content.ts';
import type { DocumentData } from '@new-cms/cms/content/generate';
import { createContent, createContentLocaleValidator } from '@new-cms/cms/content/composition';

export async function createPublicFixture() {
  const [contract] = publicDeliveryOptions().messageContracts;
  if (!contract) throw new Error('Missing public message contract');
  const kit = await createContentFixture({
    collections: publicCollections(),
    compose(options) {
      const configured = {
        ...options,
        validateAfterMutation: createContentLocaleValidator(options, contract),
      };
      return {
        content: createContent(configured),
        options: configured,
        close: () => Promise.resolve(),
      };
    },
  });
  try {
    await initializePublicFixture(kit);
    return { ...kit, delivery: kit.content.createDelivery(publicDeliveryOptions()) };
  } catch (error) {
    await kit.close();
    throw error;
  }
}
export async function initializePublicFixture(kit: ContentFixture) {
  for (const locale of ['en', 'zh'])
    await kit.content.api.createDocument(kit.owner(), {
      collection: 'message-bundles',
      data: {
        contractVersion: 'oneaster-ui.test',
        locale,
        namespace: 'site',
        messages: { hello: locale === 'en' ? 'Hello' : '你好' },
      },
    });
  for (const code of ['en', 'zh'])
    await kit.content.api.createDocument(kit.owner(), {
      collection: 'languages',
      data: {
        code,
        label: code,
        shortLabel: code,
        htmlLang: code,
        direction: 'ltr',
        enabled: true,
        default: code === 'en',
      },
    });
}
export async function createPublicModel(
  kit: ContentFixture,
  overrides: DocumentData = {},
  publish = true,
) {
  const draft = await kit.content.api.createDocument(kit.owner(), {
    collection: 'models',
    data: {
      modelId: 'business-exact-key',
      slug: 'alpha',
      title: 'Published Alpha',
      summary: 'Published summary',
      contentLocales: ['en'],
      primaryCategory: 'text',
      technicalCapabilities: { inputs: ['text'], outputs: ['text'], tasks: ['chat'], features: [] },
      apiBindings: [],
      content: { overview: 'Public content' },
      presentation: { sortOrder: 0, featured: true },
      ...overrides,
    },
  });
  return publish
    ? kit.content.api.publishDocument(kit.owner(), {
        collection: 'models',
        id: draft.id,
        revision: draft.revision,
      })
    : draft;
}
