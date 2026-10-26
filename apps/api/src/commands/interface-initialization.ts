import { randomUUID } from 'node:crypto';
import { CmsError } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { interfaceMessageContract, interfaceMessageSeeds } from '../config/message-contract.ts';

export interface InterfaceInitializationApi {
  listDocuments(
    ctx: RequestContext,
    raw: unknown,
  ): Promise<{ rows: { data: Record<string, unknown> }[]; total: number }>;
  createDocument(ctx: RequestContext, raw: unknown): Promise<unknown>;
}
const languages = [
  {
    code: 'en',
    label: 'English',
    shortLabel: 'EN',
    htmlLang: 'en',
    direction: 'ltr',
    enabled: true,
    default: true,
  },
  {
    code: 'zh',
    label: '简体中文',
    shortLabel: '简中',
    htmlLang: 'zh',
    direction: 'ltr',
    enabled: true,
    default: false,
  },
];
interface Seed {
  collection: string;
  data: Record<string, unknown>;
  identity: Record<string, string>;
}

async function insertMissing(
  api: InterfaceInitializationApi,
  ctx: RequestContext,
  seed: Seed,
): Promise<boolean> {
  const query = {
    collection: seed.collection,
    locale: 'en',
    pageSize: 2,
    where: {
      and: Object.entries(seed.identity).map(([field, value]) => ({
        field,
        operator: 'eq',
        value,
      })),
    },
  };
  const present = await api.listDocuments(ctx, query);
  if (present.total > 1) throw new CmsError('invalid_input');
  if (present.total === 1) return false;
  try {
    await api.createDocument(
      { ...ctx, idempotencyKey: randomUUID() },
      { collection: seed.collection, locale: 'en', data: seed.data },
    );
    return true;
  } catch (error) {
    if (!(error instanceof CmsError) || error.code !== 'identifier_taken') throw error;
    const concurrent = await api.listDocuments(ctx, query);
    if (concurrent.total !== 1) throw error;
    return false;
  }
}

async function initializeLanguages(
  api: InterfaceInitializationApi,
  ctx: RequestContext,
): Promise<number> {
  const existing = await api.listDocuments(ctx, {
    collection: 'languages',
    locale: 'en',
    pageSize: 100,
  });
  const defaults = existing.rows.filter((row) => row.data['default'] === true);
  if (
    existing.total > 100 ||
    defaults.length > 1 ||
    defaults.some((row) => row.data['enabled'] !== true) ||
    (defaults.length === 0 && existing.rows.some((row) => row.data['code'] === 'en'))
  )
    throw new CmsError('invalid_input');
  let created = 0;
  for (const language of languages) {
    const data = { ...language, default: language.default && defaults.length === 0 };
    if (
      await insertMissing(api, ctx, {
        collection: 'languages',
        identity: { code: language.code },
        data,
      })
    )
      created += 1;
  }
  return created;
}

export async function initializeInterfaceContent(
  api: InterfaceInitializationApi,
  ctx: RequestContext,
): Promise<{ createdLanguages: number; createdBundles: number }> {
  let createdBundles = 0;
  for (const { code: locale } of languages) {
    const messages = interfaceMessageSeeds[locale];
    if (!messages) throw new CmsError('invalid_input');
    for (const [namespace, bundle] of Object.entries(messages)) {
      const identity = { contractVersion: interfaceMessageContract.version, locale, namespace };
      if (
        await insertMissing(api, ctx, {
          collection: 'message-bundles',
          identity,
          data: { ...identity, messages: bundle },
        })
      )
        createdBundles += 1;
    }
  }
  const createdLanguages = await initializeLanguages(api, ctx);
  return { createdLanguages, createdBundles };
}
