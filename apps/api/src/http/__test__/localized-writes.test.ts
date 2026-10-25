import { afterEach, expect, it } from 'vitest';
import { bindOperations, contentDocument } from '../../../../../test/support/cms-api.ts';
import { api, createHttpFixture } from './support.ts';
import type { HttpFixture } from './support.ts';

let fixture: HttpFixture | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

it('writes translations atomically, rejects mixed write shapes and rolls back conflicting shared facts', async () => {
  fixture = await createHttpFixture();
  const client = api(fixture);
  await bindOperations(client, {
    token: fixture.token,
    collection: 'settings',
    code: 'content:settings:manage',
    operations: ['documents.create', 'documents.get', 'documents.update'],
  });
  const path = '/v1/collections/settings/documents';
  const translations = {
    en: { siteName: 'English', contactEmail: 'editor@example.test' },
    'zh-CN': { siteName: '中文', contactEmail: 'editor@example.test' },
  };
  expect(
    (
      await client('POST', path, {
        body: { locale: 'en', data: { siteName: 'Mixed' }, dataByLocale: translations },
      })
    ).status,
  ).toBe(400);
  expect((await client('POST', path, { body: { dataByLocale: {} } })).status).toBe(400);
  expect(
    (await client('POST', path, { body: { dataByLocale: { fr: { siteName: 'Unknown' } } } }))
      .status,
  ).toBe(400);
  const created = await client('POST', path, { body: { dataByLocale: translations } });
  expect(created.status).toBe(201);
  const document = contentDocument.parse(await created.json());
  const target = `${path}/${document.id}`;
  expect(document.data).toMatchObject({ siteName: 'English', contactEmail: 'editor@example.test' });
  expect(
    contentDocument.parse(await (await client('GET', `${target}?locale=zh-CN`)).json()).data,
  ).toMatchObject({ siteName: '中文', contactEmail: 'editor@example.test' });
  const conflict = await client('PATCH', target, {
    body: {
      revision: document.revision,
      dataByLocale: {
        en: { siteName: 'Changed', contactEmail: 'first@example.test' },
        'zh-CN': { contactEmail: 'second@example.test' },
      },
    },
  });
  expect(conflict.status).toBe(400);
  expect(contentDocument.parse(await (await client('GET', target)).json())).toMatchObject({
    revision: document.revision,
    data: { siteName: 'English', contactEmail: 'editor@example.test' },
  });
  const updated = await client('PATCH', target, {
    body: {
      revision: document.revision,
      dataByLocale: { en: { siteName: 'Updated' }, 'zh-CN': { siteName: '更新' } },
    },
  });
  expect(updated.status).toBe(200);
  expect(contentDocument.parse(await updated.json())).toMatchObject({
    revision: document.revision + 1,
    data: { siteName: 'Updated', contactEmail: 'editor@example.test' },
  });
  expect(
    contentDocument.parse(await (await client('GET', `${target}?locale=zh-CN`)).json()).data,
  ).toMatchObject({ siteName: '更新', contactEmail: 'editor@example.test' });
});
