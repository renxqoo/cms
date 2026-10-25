import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { collectionEditorSchema } from '@new-cms/cms/content';
import {
  cleanupEntrySchema,
  cleanupPageSchema,
  cleanupRetryReceiptSchema,
} from '@new-cms/cms/assets';
import { bindOperations, contentDocument } from '../../../../../test/support/cms-api.ts';
import { api, createHttpFixture, mailToken } from './support.ts';
import type { HttpFixture } from './support.ts';

let fixture: HttpFixture | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function assertRowContract(kit: HttpFixture, response: Response, name: string) {
  const specResponse = await api(kit)('GET', '/openapi.json');
  expect(specResponse.status).toBe(200);
  const spec = z
    .object({ components: z.object({ schemas: z.record(z.string(), z.unknown()) }) })
    .parse(await specResponse.json());
  const schema = z
    .object({
      additionalProperties: z.literal(false),
      required: z.array(z.string()),
      properties: z.record(z.string(), z.unknown()),
    })
    .parse(spec.components.schemas[name]);
  const page = z
    .object({ rows: z.array(z.record(z.string(), z.unknown())) })
    .parse(await response.clone().json());
  const [row] = page.rows;
  if (!row) throw new Error('Expected a real response row');
  expect(Object.keys(row).filter((key) => !Object.hasOwn(schema.properties, key))).toEqual([]);
  expect(schema.required.filter((key) => !Object.hasOwn(row, key))).toEqual([]);
  z.object({
    createdAt: z.iso.datetime(),
    executeAt: z.iso.datetime().optional(),
    finishedAt: z.iso.datetime().nullable().optional(),
    expiresAt: z.iso.datetime().optional(),
  }).parse(row);
}

it('serves contextual editor contracts through real collection permissions and strict query envelopes', async () => {
  const kit = await createHttpFixture();
  fixture = kit;
  const client = api(kit);
  const path = '/v1/collections/articles/editor';
  expect((await client('GET', `${path}?intent=create`)).status).toBe(403);
  for (const collection of ['articles', 'media'])
    await bindOperations(client, {
      token: kit.token,
      collection,
      code: `ui:${collection}`,
      operations: ['collections.editor', 'documents.create', 'documents.get', 'documents.update'],
    });
  const response = await client('GET', `${path}?intent=create&locale=zh-CN`);
  expect(response.status).toBe(200);
  const editor = collectionEditorSchema.parse(await response.json());
  expect(editor.document).toBeNull();
  expect(editor.locale).toBe('zh-CN');
  expect(editor.locales).toEqual({
    default: 'en',
    supported: ['en', 'zh-CN'],
    fallback: { en: [], 'zh-CN': ['en'] },
  });
  expect(editor.layout.find((field) => field.id === 'title')).toMatchObject({
    type: 'text',
    localized: true,
    write: 'allowed',
  });
  expect(editor.schemas.commit['required']).toEqual(expect.arrayContaining(['title', 'slug']));
  expect(editor.upload).toBeNull();
  const media = collectionEditorSchema.parse(
    await (await client('GET', '/v1/collections/media/editor?intent=create')).json(),
  );
  expect(media.upload).toMatchObject({
    maxBytes: 20_971_520,
    maxPixels: 40_000_000,
    maxFrames: 1,
    directUpload: false,
    multipart: false,
  });
  expect(media.upload?.mimeTypes).toContain('application/pdf');
  const created = contentDocument.parse(
    await (
      await client('POST', '/v1/collections/articles/documents', {
        body: { data: { title: 'UI contract article', slug: 'ui-contract' } },
      })
    ).json(),
  );
  const reading = await client('GET', `${path}?id=${created.id}`);
  expect(reading.status).toBe(200);
  expect(collectionEditorSchema.parse(await reading.json()).document).toMatchObject({
    id: created.id,
    revision: created.revision,
  });
  for (const query of [
    `intent=create&id=${created.id}`,
    'intent=unknown',
    `intent=update&id=${created.id}&mode=published`,
    `intent=update&id=${created.id}&fallback=%5B%22en%22%5D`,
  ])
    expect((await client('GET', `${path}?${query}`)).status).toBe(400);
  expect((await client('HEAD', `${path}?id=${created.id}`)).status).toBe(200);
});

it('finds persisted batch work and exact publication schedules before paging and returns totals for empty pages', async () => {
  const kit = await createHttpFixture();
  fixture = kit;
  const client = api(kit);
  await bindOperations(client, {
    token: kit.token,
    collection: 'articles',
    code: 'ui:jobs',
    operations: [
      'documents.create',
      'documents.get',
      'documents.update',
      'documents.publish',
      'content.batch',
      'content.listJobs',
      'content.getJob',
      'content.schedulePublication',
    ],
  });
  const created = contentDocument.parse(
    await (
      await client('POST', '/v1/collections/articles/documents', {
        body: { data: { title: 'Scheduled UI content', slug: 'ui-schedule' } },
      })
    ).json(),
  );
  const batchResponse = await client('POST', '/v1/collections/articles/batches', {
    body: {
      action: 'update',
      items: [{ id: created.id, revision: created.revision, data: { title: 'Changed by batch' } }],
    },
  });
  expect(batchResponse.status).toBe(200);
  const batch = z
    .object({ id: z.uuid(), status: z.literal('succeeded') })
    .parse(await batchResponse.json());
  const jobs = await client(
    'GET',
    `/v1/collections/articles/jobs?action=batch&documentId=${created.id}`,
  );
  expect(jobs.status).toBe(200);
  await assertRowContract(kit, jobs, 'ContentJobSummary');
  expect(await jobs.json()).toMatchObject({
    total: 1,
    rows: [
      { id: batch.id, kind: 'content', status: 'succeeded', total: 1, succeeded: 1, failed: 0 },
    ],
  });
  const current = contentDocument.parse(
    await (await client('GET', `/v1/collections/articles/documents/${created.id}`)).json(),
  );
  const scheduled = await client(
    'POST',
    `/v1/collections/articles/documents/${created.id}/publication-schedules`,
    {
      body: {
        revision: current.revision,
        versionId: current.versionId,
        executeAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    },
  );
  expect(scheduled.status).toBe(202);
  const accepted = z.object({ jobId: z.uuid() }).parse(await scheduled.json());
  const plans = await client(
    'GET',
    `/v1/collections/articles/jobs?action=publication&documentId=${created.id}`,
  );
  expect(plans.status).toBe(200);
  expect(await plans.json()).toMatchObject({
    total: 1,
    rows: [
      {
        id: accepted.jobId,
        documentId: created.id,
        requestedVersionId: current.versionId,
        expectedRevision: current.revision,
      },
    ],
  });
  const beyond = await client(
    'GET',
    '/v1/collections/articles/jobs?action=publication&page=2&pageSize=1',
  );
  expect(beyond.status).toBe(200);
  expect(await beyond.json()).toEqual({ rows: [], total: 1, page: 2, pageSize: 1 });
  expect((await client('GET', '/v1/collections/articles/jobs?action=unknown')).status).toBe(400);
});

it('discovers pending uploads with declared file information without exposing storage keys or requiring local IDs', async () => {
  const kit = await createHttpFixture();
  fixture = kit;
  const client = api(kit);
  await bindOperations(client, {
    token: kit.token,
    collection: 'media',
    code: 'ui:uploads',
    operations: [
      'assets.createUpload',
      'assets.readUpload',
      'assets.listUploads',
      'documents.create',
    ],
  });
  const response = await client('POST', '/v1/collections/media/uploads', {
    body: { purpose: 'create', filename: 'draft.pdf', mimeType: 'application/pdf', bytes: 42 },
  });
  expect(response.status).toBe(201);
  const created = z.object({ id: z.uuid() }).parse(await response.json());
  const listed = await client('GET', '/v1/collections/media/uploads?status=pending&pageSize=1');
  expect(listed.status).toBe(200);
  await assertRowContract(kit, listed, 'UploadSummary');
  const result: unknown = await listed.json();
  expect(result).toMatchObject({
    total: 1,
    page: 1,
    pageSize: 1,
    rows: [
      {
        id: created.id,
        filename: 'draft.pdf',
        declaredMimeType: 'application/pdf',
        declaredBytes: 42,
        status: 'pending',
      },
    ],
  });
  expect(JSON.stringify(result)).not.toContain('object_key');
  expect(JSON.stringify(result)).not.toContain('objects/');
  const beyond = await client('GET', '/v1/collections/media/uploads?page=2&pageSize=1');
  expect(await beyond.json()).toMatchObject({ total: 1, rows: [] });
  expect((await client('GET', '/v1/collections/media/uploads?pageSize=101')).status).toBe(400);
});

async function ordinaryActor(kit: HttpFixture) {
  const client = api(kit);
  const role = z.object({ id: z.uuid() }).parse(
    await (
      await client('POST', '/v1/roles', {
        body: { code: 'cleanup_reader', name: 'Ordinary reader' },
      })
    ).json(),
  );
  const email = 'ordinary-ui-reader@example.test';
  await client('POST', '/v1/admins', { body: { email, roleId: role.id } });
  const token = mailToken(await kit.smtp.waitForMessage());
  const password = 'Ordinary UI actor password 2026';
  const activated = await client('POST', '/v1/auth/invitation-acceptances', {
    token: null,
    body: { token, newPassword: password },
  });
  expect(activated.status).toBe(204);
  return z
    .object({ token: z.string() })
    .parse(
      await (
        await client('POST', '/v1/auth/login', { token: null, body: { email, password } })
      ).json(),
    );
}

it('accepts an audited cleanup retry once and exposes its real final ledger only to a super administrator', async () => {
  const kit = await createHttpFixture();
  fixture = kit;
  const client = api(kit);
  const id = randomUUID();
  await kit.store.database.query(
    "INSERT INTO asset_objects(id,object_key,state,retain_until,next_cleanup_at,cleanup_blocked,cleanup_attempts,cleanup_failure_code) VALUES($1,$2,'deleting',clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 minute',true,3,'temporarily_unavailable')",
    [id, `objects/${id}`],
  );
  const listed = await client('GET', '/v1/asset-cleanups');
  expect(listed.status).toBe(200);
  expect(cleanupPageSchema.parse(await listed.json())).toMatchObject({
    total: 1,
    rows: [{ id, blocked: true, state: 'deleting' }],
  });
  const reader = await ordinaryActor(kit);
  expect((await client('GET', '/v1/asset-cleanups', reader)).status).toBe(403);
  expect(
    (await client('POST', `/v1/asset-cleanups/${id}/retries`, { ...reader, body: {} })).status,
  ).toBe(403);
  const key = randomUUID();
  const accepted = await client('POST', `/v1/asset-cleanups/${id}/retries`, { key, body: {} });
  expect(accepted.status).toBe(202);
  expect(cleanupRetryReceiptSchema.parse(await accepted.json())).toEqual({
    id,
    accepted: true,
    location: `/v1/asset-cleanups/${id}`,
  });
  expect((await client('POST', `/v1/asset-cleanups/${id}/retries`, { key, body: {} })).status).toBe(
    202,
  );
  expect((await client('POST', `/v1/asset-cleanups/${id}/retries`, { body: {} })).status).toBe(409);
  const audit = await kit.store.database.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM audit_events WHERE operation_id='assets.retryCleanup' AND target_id=$1",
    [id],
  );
  expect(audit.rows[0]?.count).toBe('1');
  await kit.runtime.assets.maintenance();
  const detail = await client('GET', `/v1/asset-cleanups/${id}`);
  expect(detail.status).toBe(200);
  expect(cleanupEntrySchema.parse(await detail.json())).toMatchObject({
    id,
    state: 'deleted',
    blocked: false,
  });
  expect((await client('GET', `/v1/asset-cleanups/${id}?blocked=true`)).status).toBe(400);
  expect((await client('GET', `/v1/asset-cleanups/${randomUUID()}`)).status).toBe(404);
  expect((await client('HEAD', `/v1/asset-cleanups/${id}`)).status).toBe(200);
});
