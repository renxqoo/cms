import { expect, it } from 'vitest';
import { z } from 'zod';
import { CmsError } from '@new-cms/cms/platform/contracts';
import { initializeInterfaceContent } from '../interface-initialization.ts';
import type { InterfaceInitializationApi } from '../interface-initialization.ts';

function fixture() {
  const rows: { collection: string; data: Record<string, unknown> }[] = [];
  let conflict = false;
  function selected(raw: unknown) {
    const query = z
      .object({
        collection: z.string(),
        where: z
          .object({ and: z.array(z.object({ field: z.string(), value: z.unknown() })) })
          .optional(),
      })
      .parse(raw);
    return rows.filter(
      (row) =>
        row.collection === query.collection &&
        (!query.where || query.where.and.every((item) => row.data[item.field] === item.value)),
    );
  }
  const api: InterfaceInitializationApi = {
    listDocuments: (_ctx, raw) => {
      const found = selected(raw);
      return Promise.resolve({ rows: found, total: found.length });
    },
    createDocument: (_ctx, raw) => {
      const input = z
        .object({ collection: z.string(), data: z.record(z.string(), z.unknown()) })
        .parse(raw);
      rows.push(input);
      if (conflict) {
        conflict = false;
        return Promise.reject(new CmsError('identifier_taken'));
      }
      return Promise.resolve();
    },
  };
  return {
    api,
    rows,
    conflict: () => {
      conflict = true;
    },
  };
}
const ctx = { requestId: 'request', ip: '127.0.0.1', token: 'administrator' };

it('initializes en/zh and every software namespace once without model or demo content', async () => {
  const kit = fixture();
  const result = await initializeInterfaceContent(kit.api, ctx);
  expect(result.createdLanguages).toBe(2);
  expect(result.createdBundles).toBe(26);
  expect(kit.rows.some((row) => !['languages', 'message-bundles'].includes(row.collection))).toBe(
    false,
  );
  const next = await initializeInterfaceContent(kit.api, ctx);
  expect(next.createdLanguages).toBe(0);
  expect(next.createdBundles).toBe(0);
});

it('keeps an existing translation byte-for-byte and preserves the deployment default language', async () => {
  const kit = fixture();
  kit.rows.push(
    { collection: 'languages', data: { code: 'fr', enabled: true, default: true } },
    {
      collection: 'message-bundles',
      data: {
        contractVersion: 'oneaster-ui.v5',
        locale: 'zh',
        namespace: 'site',
        messages: { brandLine: 'Existing editorial translation' },
      },
    },
  );
  await initializeInterfaceContent(kit.api, ctx);
  expect(kit.rows.find((row) => row.data['code'] === 'en')?.data['default']).toBe(false);
  expect(
    kit.rows.filter(
      (row) =>
        row.collection === 'message-bundles' &&
        row.data['locale'] === 'zh' &&
        row.data['namespace'] === 'site',
    ),
  ).toEqual([
    {
      collection: 'message-bundles',
      data: {
        contractVersion: 'oneaster-ui.v5',
        locale: 'zh',
        namespace: 'site',
        messages: { brandLine: 'Existing editorial translation' },
      },
    },
  ]);
});

it('recovers a concurrent unique-identity insert by rereading instead of updating it', async () => {
  const kit = fixture();
  kit.conflict();
  const result = await initializeInterfaceContent(kit.api, ctx);
  expect(result.createdLanguages).toBe(2);
  expect(result.createdBundles).toBe(25);
  expect(kit.rows.filter((row) => row.data['code'] === 'en')).toHaveLength(1);
});

it('does not hide unrelated write failures or initialize an ambiguous default-language state', async () => {
  const kit = fixture();
  const api = { ...kit.api, createDocument: () => Promise.reject(new CmsError('forbidden')) };
  await expect(initializeInterfaceContent(api, ctx)).rejects.toMatchObject({ code: 'forbidden' });
  kit.rows.push({ collection: 'languages', data: { code: 'en', enabled: true, default: false } });
  await expect(initializeInterfaceContent(kit.api, ctx)).rejects.toMatchObject({
    code: 'invalid_input',
  });
});
