import { CmsError } from '@new-cms/cms/platform/contracts';
import { afterEach, expect, it } from 'vitest';
import {
  createContent,
  createContentLocaleValidator,
  createContentLocaleResolver,
} from '@new-cms/cms/content/composition';
import { createContentFixture } from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';
import { oneasterCollections } from '../collections/oneaster.ts';
import { publicCollections } from '../../../../../test/support/public-content.ts';
import { interfaceMessageSeeds, interfaceMessageContract } from '../message-contract.ts';
import { initializeInterfaceContent } from '../../commands/interface-initialization.ts';

let kit: ContentFixture | undefined;
afterEach(async () => {
  await kit?.close();
  kit = undefined;
});
async function fixture() {
  kit = await createContentFixture({
    collections: [
      ...oneasterCollections.filter((value) =>
        ['languages', 'message-bundles'].includes(value.key),
      ),
      ...publicCollections()
        .filter((value) => value.key === 'models')
        .map((value) => ({
          ...value,
          localeSource: 'languages',
          search: ['title'],
          fields: value.fields.filter((field) =>
            ['title', 'contentLocales'].includes(field.name ?? ''),
          ),
        })),
    ].map((value) => ({ ...value, id: `test_${value.id}` })),
    compose(options) {
      const configured = {
        ...options,
        resolveLocaleSource: createContentLocaleResolver(options),
        validateAfterMutation: createContentLocaleValidator(options, interfaceMessageContract),
      };
      return {
        content: createContent(configured),
        options: configured,
        close: () => Promise.resolve(),
      };
    },
  });
  await initializeInterfaceContent(kit.content.api, kit.owner());
  return kit;
}
async function language(f: ContentFixture, code: string) {
  const list = await f.content.api.listDocuments(f.owner(), { collection: 'languages' });
  const found = list.rows.find((row) => row.data['code'] === code);
  if (!found) throw new Error('Missing language');
  return found;
}
it.each([{ label: ' ' }, { shortLabel: ' ' }, { htmlLang: 'invalid_locale' }])(
  'rejects language metadata %j before it invalidates every public interface',
  async (data) => {
    const f = await fixture();
    const zh = await language(f, 'zh');
    await expect(
      f.content.api.updateDocument(f.owner(), {
        collection: 'languages',
        id: zh.id,
        revision: zh.revision,
        data,
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    expect((await language(f, 'zh')).revision).toBe(zh.revision);
  },
);
it('cannot rename a canonical language code and silently orphan its translations', async () => {
  const f = await fixture(),
    zh = await language(f, 'zh');
  await expect(
    f.content.api.updateDocument(f.owner(), {
      collection: 'languages',
      id: zh.id,
      revision: zh.revision,
      data: { code: 'fr' },
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  expect((await language(f, 'zh')).revision).toBe(zh.revision);
});
it('cannot archive a nondefault language or current software messages', async () => {
  const f = await fixture(),
    zh = await language(f, 'zh');
  await expect(
    f.content.api.archiveDocument(f.owner(), {
      collection: 'languages',
      id: zh.id,
      revision: zh.revision,
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  const bundles = await f.content.api.listDocuments(f.owner(), { collection: 'message-bundles' });
  const [bundle] = bundles.rows;
  if (!bundle) throw new Error('Missing software messages');
  await expect(
    f.content.api.archiveDocument(f.owner(), {
      collection: 'message-bundles',
      id: bundle.id,
      revision: bundle.revision,
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});
it('cannot enable a new language before every software namespace exists', async () => {
  const f = await fixture();
  const fr = await f.content.api.createDocument(f.owner(), {
    collection: 'languages',
    data: { code: 'fr', label: 'Français', direction: 'ltr', enabled: false, default: false },
  });
  await expect(
    f.content.api.updateDocument(f.owner(), {
      collection: 'languages',
      id: fr.id,
      revision: fr.revision,
      data: { enabled: true },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  const saved = await language(f, 'fr');
  expect(saved.data['enabled']).toBe(false);
  expect(saved.revision).toBe(fr.revision);
});

it('atomically switches defaults through the authorized API and rejects stale concurrent intent', async () => {
  const f = await fixture(),
    zh = await language(f, 'zh'),
    en = await language(f, 'en');
  const input = {
    collection: 'languages',
    id: zh.id,
    revision: zh.revision,
    expectedDefaultCode: 'en',
  };
  const context = f.owner();
  const result = await f.content.api.setDefaultLanguage(context, input);
  expect(result.data['default']).toBe(true);
  expect((await language(f, 'en')).data['default']).toBe(false);
  expect((await language(f, 'en')).revision).toBe(en.revision + 1);
  expect((await f.content.api.setDefaultLanguage(context, input)).versionId).toBe(result.versionId);
  await expect(
    f.content.api.setDefaultLanguage(f.owner(), {
      collection: 'languages',
      id: en.id,
      revision: en.revision + 1,
      expectedDefaultCode: 'en',
    }),
  ).rejects.toMatchObject({ code: 'version_conflict' });
});
it('rolls back both default revisions and audit when the second write is denied', async () => {
  const f = await fixture(),
    zh = await language(f, 'zh'),
    en = await language(f, 'en');
  let updates = 0;
  const restricted = createContent({
    ...f.contentOptions,
    authorize: async (...parameters) => {
      const [tx, ctx, operation, scope] = parameters;
      if (operation === 'documents.update' && ++updates === 2) {
        throw new CmsError('forbidden');
      }
      return f.contentOptions.authorize(tx, ctx, operation, scope);
    },
  });
  await expect(
    restricted.api.setDefaultLanguage(f.owner(), {
      collection: 'languages',
      id: zh.id,
      revision: zh.revision,
      expectedDefaultCode: 'en',
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  expect(updates).toBe(2);
  expect(
    (
      await f.database.query(
        "SELECT id FROM audit_events WHERE operation_id='languages.setDefault'",
      )
    ).rowCount,
  ).toBe(0);
  expect((await language(f, 'en')).revision).toBe(en.revision);
  expect((await language(f, 'zh')).revision).toBe(zh.revision);
});

it('concurrent default switches have one winner and preserve one enabled default', async () => {
  const f = await fixture(),
    zh = await language(f, 'zh');
  const fr = await f.content.api.createDocument(f.owner(), {
    collection: 'languages',
    data: { code: 'fr', label: 'Français', direction: 'ltr', enabled: false, default: false },
  });
  const messages = interfaceMessageSeeds['fr'];
  if (!messages) throw new Error('Missing French software messages');
  for (const [namespace, bundle] of Object.entries(messages))
    await f.content.api.createDocument(f.owner(), {
      collection: 'message-bundles',
      data: {
        contractVersion: interfaceMessageContract.version,
        locale: 'fr',
        namespace,
        messages: bundle,
      },
    });
  const enabled = await f.content.api.updateDocument(f.owner(), {
    collection: 'languages',
    id: fr.id,
    revision: fr.revision,
    data: { enabled: true },
  });
  const results = await Promise.allSettled(
    [zh, enabled].map((value) =>
      f.content.api.setDefaultLanguage(f.owner(), {
        collection: 'languages',
        id: value.id,
        revision: value.revision,
        expectedDefaultCode: 'en',
      }),
    ),
  );
  expect(results.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
  expect(results.find((value) => value.status === 'rejected')).toMatchObject({
    reason: { code: 'version_conflict' },
  });
  const rows = await f.content.api.listDocuments(f.owner(), { collection: 'languages' });
  expect(
    rows.rows.filter((row) => row.data['default'] === true && row.data['enabled'] === true),
  ).toHaveLength(1);
});
it('disabling a language retains supported content translations and software identities', async () => {
  const f = await fixture(),
    zh = await language(f, 'zh');
  const model = await f.content.api.createDocument(f.owner(), {
    collection: 'models',
    dataByLocale: {
      en: { title: 'English', contentLocales: ['en', 'zh'] },
      zh: { title: '保留的翻译', contentLocales: ['en', 'zh'] },
    },
  });
  await f.content.api.updateDocument(f.owner(), {
    collection: 'languages',
    id: zh.id,
    revision: zh.revision,
    data: { enabled: false },
  });
  expect(
    (
      await f.content.api.getDocument(f.owner(), {
        collection: 'models',
        id: model.id,
        locale: 'zh',
      })
    ).data['title'],
  ).toBe('保留的翻译');
  const bundles = await f.content.api.listDocuments(f.owner(), {
    collection: 'message-bundles',
    where: { field: 'locale', operator: 'eq', value: 'zh' },
  });
  const [bundle] = bundles.rows;
  if (!bundle) throw new Error('Missing retained bundle');
  const namespace = bundle.data['namespace'] === 'site' ? 'auth' : 'site';
  const replacement = interfaceMessageSeeds['zh']?.[namespace];
  if (replacement === undefined) throw new Error('Missing alternate valid namespace');
  for (const data of [
    { locale: 'fr' },
    { namespace, messages: replacement },
    { contractVersion: 'another-contract' },
  ])
    await expect(
      f.content.api.updateDocument(f.owner(), {
        collection: 'message-bundles',
        id: bundle.id,
        revision: bundle.revision,
        data,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(
    f.content.api.createDocument(f.owner(), {
      collection: 'message-bundles',
      data: { ...bundle.data, contractVersion: 'another-contract' },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect(
    (await f.content.api.getDocument(f.owner(), { collection: 'message-bundles', id: bundle.id }))
      .versionId,
  ).toBe(bundle.versionId);
  await expect(
    f.content.api.purgeDocument(f.owner(), {
      collection: 'languages',
      id: zh.id,
      revision: zh.revision + 1,
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  expect(bundles.total).toBe(13);
});

it('rejects canonical locale codes that would poison the runtime and publication locale grammar', async () => {
  const f = await fixture();
  await expect(
    f.content.api.createDocument(f.owner(), {
      collection: 'languages',
      data: {
        code: 'en-variant1-variant2-variant3-variant4',
        label: 'Extended',
        direction: 'ltr',
        enabled: false,
        default: false,
      },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect((await f.content.api.listDocuments(f.owner(), { collection: 'languages' })).total).toBe(2);
});

it('rolls back a default switch when the current software contract is unavailable', async () => {
  const f = await fixture(),
    en = await language(f, 'en'),
    zh = await language(f, 'zh');
  const next = createContent({
    ...f.contentOptions,
    validateAfterMutation: createContentLocaleValidator(f.contentOptions, {
      ...interfaceMessageContract,
      version: 'oneaster-ui.next',
    }),
  });
  await expect(
    next.api.setDefaultLanguage(f.owner(), {
      collection: 'languages',
      id: zh.id,
      revision: zh.revision,
      expectedDefaultCode: 'en',
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect((await language(f, 'en')).revision).toBe(en.revision);
  expect((await language(f, 'zh')).revision).toBe(zh.revision);
  expect(
    (
      await f.database.query(
        "SELECT id FROM audit_events WHERE operation_id='languages.setDefault'",
      )
    ).rowCount,
  ).toBe(0);
});
it('treats selecting the existing default as a version-checked no-op', async () => {
  const f = await fixture(),
    en = await language(f, 'en');
  const unchanged = await f.content.api.setDefaultLanguage(f.owner(), {
    collection: 'languages',
    id: en.id,
    revision: en.revision,
    expectedDefaultCode: 'en',
  });
  expect(unchanged.versionId).toBe(en.versionId);
  await expect(
    f.content.api.setDefaultLanguage(f.owner(), {
      collection: 'languages',
      id: en.id,
      revision: en.revision + 1,
      expectedDefaultCode: 'en',
    }),
  ).rejects.toMatchObject({ code: 'version_conflict' });
});
