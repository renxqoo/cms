import { randomUUID, createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createAssets } from '../composition.ts';
import { assetObjects, assetManifests } from '@new-cms/database/schema/assets';
import { context, createFixture, memoryStorage, pdf, png, readyUpload, stream } from './support.ts';

it('completes a real upload, pins immutable bytes to a document revision and downloads exact bytes', async () => {
  const fixture = await createFixture();
  const ready = await readyUpload(fixture);
  const resource = await fixture.revision();
  const bound = await fixture.database.transaction((tx) =>
    fixture.assets.participants.bind(tx, {
      locale: 'en',
      operationId: 'documents.create',
      actorId: fixture.admin.id,
      collectionKey: 'media',
      documentId: resource.documentId,
      revisionId: resource.revisionId,
      sourcePath: '$file',
      uploadId: ready.id,
    }),
  );
  expect(bound.manifest.digest).toBe(createHash('sha256').update(pdf).digest('hex'));
  expect(bound.manifest.objects).toHaveLength(1);
  const persisted = await fixture.database.orm.select().from(assetObjects);
  expect(persisted).toMatchObject([
    {
      bytes: pdf.byteLength,
      mimeType: 'application/pdf',
      state: 'ready',
      digest: bound.manifest.digest,
    },
  ]);
  expect(await fixture.database.orm.select().from(assetManifests)).toMatchObject([
    { id: bound.manifest.id, filename: 'private-file.pdf', state: 'ready' },
  ]);
  expect(
    await fixture.assets.participants.listBindings(fixture.database, {
      revisionId: resource.revisionId,
    }),
  ).toMatchObject([{ bindingId: bound.bindingId, sourcePath: '$file' }]);
  const downloaded = await fixture.assets.api.download(context(fixture.owner.token), {
    collection: 'media',
    id: resource.documentId,
  });
  expect(new Uint8Array(await new Response(downloaded.stream).arrayBuffer())).toEqual(pdf);
  expect(downloaded).toMatchObject({
    filename: 'private-file.pdf',
    mimeType: 'application/pdf',
    bytes: pdf.byteLength,
  });
  const consumed = await fixture.assets.api.readUpload(context(fixture.owner.token), {
    collection: 'media',
    uploadId: ready.id,
  });
  expect(consumed.status).toBe('consumed');
  const job = await fixture.assets.api.readJob(context(fixture.owner.token), {
    collection: 'media',
    jobId: ready.jobId,
  });
  expect(job).toMatchObject({ status: 'succeeded', manifest: { id: ready.manifest.id } });
});

it('replays resource references only and rejects replay after current content authorization is revoked', async () => {
  const fixture = await createFixture();
  const ctx = context(fixture.owner.token);
  const input = {
    collection: 'media',
    purpose: 'create',
    filename: 'idempotent.pdf',
    mimeType: 'application/pdf',
    bytes: pdf.byteLength,
  };
  const first = await fixture.assets.api.createUpload(ctx, input);
  expect(await fixture.assets.api.createUpload(ctx, input)).toEqual(first);
  const cached = await fixture.database.query<{ result: unknown }>(
    "SELECT result FROM idempotency_records WHERE operation_id='assets.createUpload'",
  );
  expect(cached.rows[0]?.result).toEqual({ id: first.id });
  await expect(
    fixture.assets.api.createUpload(ctx, { ...input, filename: 'different.pdf' }),
  ).rejects.toMatchObject({ code: 'idempotency_conflict' });
  fixture.deny();
  await expect(fixture.assets.api.createUpload(ctx, input)).rejects.toMatchObject({
    code: 'forbidden',
  });
});

it('rejects a forged manifest grant, wrong actor and replacement revision while preserving ready uploads', async () => {
  const fixture = await createFixture();
  const ready = await readyUpload(fixture);
  const target = await fixture.revision();
  const base = {
    collectionKey: 'media',
    documentId: target.documentId,
    revisionId: target.revisionId,
    sourcePath: '$file',
  };
  await expect(
    fixture.database.transaction((tx) =>
      fixture.assets.participants.bind(tx, {
        locale: 'en',
        operationId: 'documents.create',
        ...base,
        actorId: randomUUID(),
        uploadId: ready.id,
      }),
    ),
  ).rejects.toMatchObject({ code: 'forbidden' });
  const replacement = await readyUpload(fixture, pdf, {
    documentId: target.documentId,
    revision: 1,
  });
  await expect(
    fixture.database.transaction((tx) =>
      fixture.assets.participants.bind(tx, {
        locale: 'en',
        operationId: 'documents.create',
        ...base,
        actorId: fixture.admin.id,
        expectedRevision: 2,
        uploadId: replacement.id,
      }),
    ),
  ).rejects.toMatchObject({ code: 'version_conflict' });
  expect(
    (
      await fixture.assets.api.readUpload(context(fixture.owner.token), {
        collection: 'media',
        uploadId: replacement.id,
      })
    ).status,
  ).toBe('ready');
  expect(() =>
    fixture.assets.api.createUpload(context(fixture.owner.token), {
      collection: 'media',
      purpose: 'create',
      filename: 'x.pdf',
      mimeType: 'application/pdf',
      bytes: 1,
      manifestId: ready.manifest.id,
    }),
  ).toThrow('invalid input');
});

it('keeps old source bindings readable after media replaces bytes and its own old revision is pruned', async () => {
  const fixture = await createFixture();
  const first = await readyUpload(fixture);
  const media = await fixture.revision();
  await fixture.database.transaction((tx) =>
    fixture.assets.participants.bind(tx, {
      locale: 'en',
      operationId: 'documents.create',
      actorId: fixture.admin.id,
      collectionKey: 'media',
      ...media,
      sourcePath: '$file',
      uploadId: first.id,
    }),
  );
  const source = await fixture.revision();
  const sourceBinding = await fixture.database.transaction(async (tx) => {
    const grant = await fixture.assets.participants.resolveRevisionMedia(tx, {
      revisionId: media.revisionId,
      sourcePath: '$file',
      mediaDocumentId: media.documentId,
    });
    return fixture.assets.participants.bind(tx, {
      locale: 'en',
      operationId: 'documents.create',
      actorId: fixture.admin.id,
      collectionKey: 'media',
      ...source,
      sourcePath: 'hero',
      authorizedManifest: grant,
    });
  });
  const nextBytes = new TextEncoder().encode(
    '%PDF-1.7\nreplacement with different actual bytes\n%%EOF',
  );
  const next = await readyUpload(fixture, nextBytes, { documentId: media.documentId, revision: 1 });
  const changed = await fixture.revision(media.documentId, 2);
  await fixture.database.transaction(async (tx) => {
    await fixture.assets.participants.bind(tx, {
      locale: 'en',
      operationId: 'documents.create',
      actorId: fixture.admin.id,
      collectionKey: 'media',
      ...changed,
      sourcePath: '$file',
      expectedRevision: 1,
      uploadId: next.id,
    });
    await fixture.assets.participants.releaseRevision(tx, { revisionId: media.revisionId });
    await tx.query('DELETE FROM content_revisions WHERE id=$1', [media.revisionId]);
  });
  const history = await fixture.assets.api.download(context(fixture.owner.token), {
    collection: 'media',
    id: source.documentId,
    bindingId: sourceBinding.bindingId,
  });
  expect(new Uint8Array(await new Response(history.stream).arrayBuffer())).toEqual(pdf);
  const current = await fixture.assets.api.download(context(fixture.owner.token), {
    collection: 'media',
    id: media.documentId,
  });
  expect(new Uint8Array(await new Response(current.stream).arrayBuffer())).toEqual(nextBytes);
  expect(
    await fixture.database.query('SELECT 1 FROM asset_references WHERE media_document_id=$1', [
      media.documentId,
    ]),
  ).toMatchObject({ rowCount: 2 });
});

it('reprocesses into a new manifest sharing the original and commits one replacement content revision', async () => {
  const fixture = await createFixture();
  const ready = await readyUpload(fixture, png, { mimeType: 'image/png' });
  const media = await fixture.revision();
  await fixture.database.transaction((tx) =>
    fixture.assets.participants.bind(tx, {
      locale: 'en',
      operationId: 'documents.create',
      actorId: fixture.admin.id,
      collectionKey: 'media',
      ...media,
      sourcePath: '$file',
      uploadId: ready.id,
    }),
  );
  const processingContext = context(fixture.owner.token);
  const accepted = await fixture.assets.api.reprocess(processingContext, {
    collection: 'media',
    id: media.documentId,
    revision: 1,
    recipe: { variants: [], focalPoint: { x: 1, y: 0 } },
  });
  await fixture.assets.maintenance();
  const job = await fixture.assets.api.readJob(context(fixture.owner.token), {
    collection: 'media',
    jobId: accepted.jobId,
  });
  expect(job.status).toBe('succeeded');
  expect(
    await fixture.assets.api.reprocess(processingContext, {
      collection: 'media',
      id: media.documentId,
      revision: 1,
      recipe: { variants: [], focalPoint: { x: 1, y: 0 } },
    }),
  ).toEqual(accepted);
  expect(job.manifest?.id).not.toBe(ready.manifest.id);
  const originals = await fixture.database.query<{ object_id: string }>(
    "SELECT object_id FROM asset_manifest_objects WHERE name='original'",
  );
  expect(new Set(originals.rows.map((row) => row.object_id)).size).toBe(1);
  expect(
    (
      await fixture.database.query<{ revision: number }>(
        'SELECT revision FROM content_documents WHERE id=$1',
        [media.documentId],
      )
    ).rows[0]?.revision,
  ).toBe(2);
  await fixture.database.query(
    "UPDATE asset_manifests SET retain_until=clock_timestamp()-interval '1 second'",
  );
  await fixture.database.query(
    "UPDATE asset_objects SET retain_until=clock_timestamp()-interval '1 second'",
  );
  await fixture.database.transaction((tx) =>
    fixture.assets.participants.releaseRevision(tx, { revisionId: media.revisionId }),
  );
  await fixture.database.query(
    "UPDATE asset_manifests SET retain_until=clock_timestamp()-interval '1 second' WHERE id=$1",
    [ready.manifest.id],
  );
  await fixture.assets.maintenance();
  expect(fixture.memory.objects.size).toBe(1);
});

it('rejects forged type, byte overflow and duplicate concurrent upload claims', async () => {
  const fixture = await createFixture({ limits: { maxUploadBytes: 100 } });
  const created = await fixture.assets.api.createUpload(context(fixture.owner.token), {
    collection: 'media',
    purpose: 'create',
    filename: 'x.pdf',
    mimeType: 'application/pdf',
    bytes: pdf.byteLength,
  });
  const first = fixture.assets.api.writeUpload(
    context(fixture.owner.token),
    { collection: 'media', uploadId: created.id },
    stream(pdf),
  );
  const second = fixture.assets.api.writeUpload(
    context(fixture.owner.token),
    { collection: 'media', uploadId: created.id },
    stream(pdf),
  );
  const results = await Promise.allSettled([first, second]);
  expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
  const wrong = await fixture.assets.api.createUpload(context(fixture.owner.token), {
    collection: 'media',
    purpose: 'create',
    filename: 'x.pdf',
    mimeType: 'application/pdf',
    bytes: png.byteLength,
  });
  await expect(
    fixture.assets.api.writeUpload(
      context(fixture.owner.token),
      { collection: 'media', uploadId: wrong.id },
      stream(png),
    ),
  ).rejects.toMatchObject({ code: 'unsupported_media_type' });
  const overflow = await fixture.assets.api.createUpload(context(fixture.owner.token), {
    collection: 'media',
    purpose: 'create',
    filename: 'x.pdf',
    mimeType: 'application/pdf',
    bytes: 100,
  });
  await expect(
    fixture.assets.api.writeUpload(
      context(fixture.owner.token),
      { collection: 'media', uploadId: overflow.id },
      stream(new Uint8Array(101)),
    ),
  ).rejects.toMatchObject({ code: 'payload_too_large' });
});

it('fences an expired worker before it can bind a second manifest', async () => {
  let resolveFirst: (() => void) | undefined;
  let started: (() => void) | undefined;
  const firstStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  let calls = 0;
  const fixture = await createFixture({
    images: {
      version: 'race-image-v1',
      close: () => Promise.resolve(),
      async process() {
        calls += 1;
        if (calls === 1) {
          started?.();
          await new Promise<void>((resolve) => {
            resolveFirst = resolve;
          });
        }
        return { width: 1, height: 1, orientation: 1, variants: [] };
      },
    },
  });
  const created = await fixture.assets.api.createUpload(context(fixture.owner.token), {
    collection: 'media',
    purpose: 'create',
    filename: 'x.png',
    mimeType: 'image/png',
    bytes: png.byteLength,
  });
  await fixture.assets.api.writeUpload(
    context(fixture.owner.token),
    { collection: 'media', uploadId: created.id },
    stream(png),
  );
  const queued = await fixture.assets.api.completeUpload(context(fixture.owner.token), {
    collection: 'media',
    uploadId: created.id,
  });
  const old = fixture.assets.maintenance();
  await firstStarted;
  await fixture.database.query(
    "UPDATE asset_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
    [queued.jobId],
  );
  const other = createAssets(fixture.options);
  await other.maintenance();
  resolveFirst?.();
  await old;
  await other.close();
  const rows = await fixture.database.query<{ count: string }>(
    'SELECT count(*) AS count FROM asset_manifests',
  );
  expect(rows.rows[0]?.count).toBe('1');
  expect(
    await fixture.assets.api.readJob(context(fixture.owner.token), {
      collection: 'media',
      jobId: queued.jobId,
    }),
  ).toMatchObject({ status: 'succeeded', attempts: 2 });
});

it('retains cleanup responsibility for a cancelled upload with a possible late shared-storage write', async () => {
  const storage = memoryStorage(true);
  let pendingKey: string | undefined;
  storage.driver.put = (input) => {
    pendingKey = input.key;
    return new Promise<void>((_resolve, reject) => {
      input.signal.addEventListener('abort', () => reject(new Error('Network aborted')), {
        once: true,
      });
    });
  };
  const fixture = await createFixture({ storage: storage.driver });
  const created = await fixture.assets.api.createUpload(context(fixture.owner.token), {
    collection: 'media',
    purpose: 'create',
    filename: 'x.pdf',
    mimeType: 'application/pdf',
    bytes: pdf.byteLength,
  });
  const controller = new AbortController();
  const writing = fixture.assets.api.writeUpload(
    { ...context(fixture.owner.token), signal: controller.signal },
    { collection: 'media', uploadId: created.id },
    stream(pdf),
  );
  await vi.waitFor(() => expect(pendingKey).toBeDefined());
  controller.abort();
  await expect(writing).rejects.toThrow('Network aborted');
  await fixture.assets.api.cancelUpload(context(fixture.owner.token), {
    collection: 'media',
    uploadId: created.id,
  });
  await fixture.database.query(
    "UPDATE asset_objects SET retain_until=clock_timestamp()-interval '1 second',write_deadline=clock_timestamp()-interval '1 second'",
  );
  await fixture.assets.maintenance();
  if (!pendingKey) throw new Error('Expected an in-flight storage key');
  storage.objects.set(pendingKey, pdf);
  await fixture.database.query(
    "UPDATE asset_objects SET next_cleanup_at=clock_timestamp()-interval '1 second'",
  );
  await fixture.assets.maintenance();
  expect(storage.objects.size).toBe(0);
  expect(
    (await fixture.database.query<{ state: string }>('SELECT state FROM asset_objects')).rows[0]
      ?.state,
  ).toBe('deleting');
});

it('session inspection cannot deadlock a document write that consumes the same replacement upload', async () => {
  const fixture = await createFixture();
  const media = await fixture.revision();
  const ready = await readyUpload(fixture, pdf, { documentId: media.documentId, revision: 1 });
  const nextRevision = randomUUID();
  let inspection: ReturnType<typeof fixture.assets.api.readUpload> | undefined;
  await fixture.database.transaction(async (tx) => {
    await tx.query('SELECT id FROM content_documents WHERE id=$1 FOR UPDATE', [media.documentId]);
    await tx.query(
      "INSERT INTO content_revisions(id,document_id,collection_id,revision,schema_version,kind,actor_id) VALUES($1,$2,'media',2,1,'save',$3)",
      [nextRevision, media.documentId, fixture.admin.id],
    );
    inspection = fixture.assets.api.readUpload(context(fixture.owner.token), {
      collection: 'media',
      uploadId: ready.id,
    });
    inspection.catch(() => {});
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const waiting = await fixture.database.query(
        "SELECT 1 FROM pg_stat_activity a WHERE a.wait_event_type='Lock' AND a.pid IN(SELECT pid FROM pg_locks WHERE relation='content_documents'::regclass)",
      );
      if (waiting.rowCount !== 0) break;
      await new Promise((resolve) => {
        setTimeout(resolve, 1);
      });
    }
    await fixture.assets.participants.bind(tx, {
      locale: 'en',
      operationId: 'documents.create',
      actorId: fixture.admin.id,
      collectionKey: 'media',
      documentId: media.documentId,
      revisionId: nextRevision,
      sourcePath: '$file',
      expectedRevision: 1,
      uploadId: ready.id,
    });
    await tx.query('UPDATE content_documents SET revision=2,current_version_id=$2 WHERE id=$1', [
      media.documentId,
      nextRevision,
    ]);
  });
  expect(await inspection).toMatchObject({ status: 'consumed' });
});

it('copying a media file binds the shared bytes to the new media identity', async () => {
  const fixture = await createFixture();
  const ready = await readyUpload(fixture);
  const original = await fixture.revision();
  await fixture.database.transaction((tx) =>
    fixture.assets.participants.bind(tx, {
      locale: 'en',
      operationId: 'documents.create',
      actorId: fixture.admin.id,
      collectionKey: 'media',
      ...original,
      sourcePath: '$file',
      uploadId: ready.id,
    }),
  );
  const copied = await fixture.revision();
  await fixture.database.transaction(async (tx) => {
    const authorizedManifest = await fixture.assets.participants.resolveRevisionMedia(tx, {
      revisionId: original.revisionId,
      sourcePath: '$file',
      mediaDocumentId: original.documentId,
    });
    await fixture.assets.participants.bind(tx, {
      locale: 'en',
      operationId: 'documents.create',
      actorId: fixture.admin.id,
      collectionKey: 'media',
      ...copied,
      sourcePath: '$file',
      authorizedManifest,
    });
  });
  const bindings = await fixture.assets.participants.listBindings(fixture.database, {
    revisionId: copied.revisionId,
  });
  expect(bindings).toMatchObject([
    {
      mediaDocumentId: copied.documentId,
      mediaCollectionKey: 'media',
      manifest: { id: ready.manifest.id },
    },
  ]);
});
