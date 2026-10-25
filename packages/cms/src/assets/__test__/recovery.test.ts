import { expect, it } from 'vitest';
import { createAssets } from '../composition.ts';
import { createTestS3 } from '../../../../../test/support/s3.ts';
import { context, createFixture, png, readyUpload, pdf, stream } from './support.ts';

it('stores and serves variant bytes through immutable per-generation candidates', async () => {
  const derived = new Uint8Array([...png, 42]);
  const fixture = await createFixture({
    images: {
      version: 'programmable-image-v2',
      close: () => Promise.resolve(),
      process: () =>
        Promise.resolve({
          width: 100,
          height: 50,
          orientation: 1,
          variants: [
            { name: 'thumbnail', bytes: derived, mimeType: 'image/png', width: 10, height: 5 },
          ],
        }),
    },
  });
  const ready = await readyUpload(fixture, png, { mimeType: 'image/png' });
  expect(ready.manifest.objects).toMatchObject([
    { name: 'original', bytes: png.byteLength },
    { name: 'thumbnail', bytes: derived.byteLength },
  ]);
  const document = await fixture.revision();
  await fixture.database.transaction((tx) =>
    fixture.assets.participants.bind(tx, {
      actorId: fixture.admin.id,
      collectionKey: 'media',
      ...document,
      sourcePath: '$file',
      uploadId: ready.id,
    }),
  );
  const download = await fixture.assets.api.download(context(fixture.owner.token), {
    collection: 'media',
    id: document.documentId,
    variant: 'thumbnail',
  });
  expect(new Uint8Array(await new Response(download.stream).arrayBuffer())).toEqual(derived);
  await fixture.assets.verifyReady();
  expect(fixture.memory.objects.size).toBe(2);
});

it('retries a transient processing failure and reports the actual eventual result', async () => {
  let fail = true;
  const fixture = await createFixture({
    images: {
      version: 'retry-image-v1',
      close: () => Promise.resolve(),
      process() {
        if (fail) return Promise.reject(new Error('Transient decoder failure'));
        return Promise.resolve({ width: 1, height: 1, orientation: 1, variants: [] });
      },
    },
  });
  const upload = await fixture.assets.api.createUpload(context(fixture.owner.token), {
    collection: 'media',
    purpose: 'create',
    filename: 'retry.png',
    mimeType: 'image/png',
    bytes: png.byteLength,
  });
  await fixture.assets.api.writeUpload(
    context(fixture.owner.token),
    { collection: 'media', uploadId: upload.id },
    stream(png),
  );
  const queued = await fixture.assets.api.completeUpload(context(fixture.owner.token), {
    collection: 'media',
    uploadId: upload.id,
  });
  await fixture.assets.maintenance();
  expect(
    await fixture.assets.api.readJob(context(fixture.owner.token), {
      collection: 'media',
      jobId: queued.jobId,
    }),
  ).toMatchObject({ status: 'queued', attempts: 1, failureCode: 'temporarily_unavailable' });
  fail = false;
  await fixture.database.query(
    "UPDATE asset_jobs SET next_run_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [queued.jobId],
  );
  await fixture.assets.maintenance();
  expect(
    await fixture.assets.api.readJob(context(fixture.owner.token), {
      collection: 'media',
      jobId: queued.jobId,
    }),
  ).toMatchObject({ status: 'succeeded', attempts: 2, failureCode: null });
});

it('stops an exhausted processing job and its upload in a consistent failure state', async () => {
  const fixture = await createFixture();
  const upload = await fixture.assets.api.createUpload(context(fixture.owner.token), {
    collection: 'media',
    purpose: 'create',
    filename: 'exhausted.png',
    mimeType: 'image/png',
    bytes: png.byteLength,
  });
  await fixture.assets.api.writeUpload(
    context(fixture.owner.token),
    { collection: 'media', uploadId: upload.id },
    stream(png),
  );
  const queued = await fixture.assets.api.completeUpload(context(fixture.owner.token), {
    collection: 'media',
    uploadId: upload.id,
  });
  await fixture.database.query('UPDATE asset_jobs SET attempts=$2 WHERE id=$1', [
    queued.jobId,
    fixture.options.limits.jobAttempts,
  ]);
  await fixture.assets.maintenance();
  expect(
    await fixture.assets.api.readJob(context(fixture.owner.token), {
      collection: 'media',
      jobId: queued.jobId,
    }),
  ).toMatchObject({ status: 'failed', failureCode: 'capacity_exceeded' });
  expect(
    await fixture.assets.api.readUpload(context(fixture.owner.token), {
      collection: 'media',
      uploadId: upload.id,
    }),
  ).toMatchObject({ status: 'failed', failureCode: 'capacity_exceeded' });
});

it('checks current actor grants before committing a background processing result', async () => {
  const fixture = await createFixture();
  const upload = await fixture.assets.api.createUpload(context(fixture.owner.token), {
    collection: 'media',
    purpose: 'create',
    filename: 'revoked.pdf',
    mimeType: 'application/pdf',
    bytes: pdf.byteLength,
  });
  await fixture.assets.api.writeUpload(
    context(fixture.owner.token),
    { collection: 'media', uploadId: upload.id },
    stream(pdf),
  );
  const queued = await fixture.assets.api.completeUpload(context(fixture.owner.token), {
    collection: 'media',
    uploadId: upload.id,
  });
  const binding = fixture.bindings.find((item) => item.operationId === 'assets.completeUpload');
  if (!binding) throw new Error('Missing processing binding');
  await fixture.access.api.deleteBinding(context(fixture.owner.token), {
    id: binding.id,
    version: binding.version,
  });
  await fixture.assets.maintenance();
  expect(
    (
      await fixture.database.query<{ status: string; failure_code: string }>(
        'SELECT status,failure_code FROM asset_jobs WHERE id=$1',
        [queued.jobId],
      )
    ).rows[0],
  ).toMatchObject({ status: 'failed', failure_code: 'endpoint_unbound' });
  expect((await fixture.database.query('SELECT id FROM asset_manifests')).rowCount).toBe(0);
  await expect(
    fixture.assets.api.readJob(context(fixture.owner.token), {
      collection: 'media',
      jobId: queued.jobId,
    }),
  ).rejects.toMatchObject({ code: 'endpoint_unbound' });
});

it('rejects manifest capabilities reused across transactions and protects consumed uploads from cancellation', async () => {
  const fixture = await createFixture();
  const ready = await readyUpload(fixture);
  const media = await fixture.revision();
  const binding = await fixture.database.transaction((tx) =>
    fixture.assets.participants.bind(tx, {
      actorId: fixture.admin.id,
      collectionKey: 'media',
      ...media,
      sourcePath: '$file',
      uploadId: ready.id,
    }),
  );
  const resolved = await fixture.database.transaction((tx) =>
    fixture.assets.participants.resolveBinding(tx, {
      revisionId: media.revisionId,
      bindingId: binding.bindingId,
    }),
  );
  const copied = await fixture.revision();
  await expect(
    fixture.database.transaction((tx) =>
      fixture.assets.participants.bind(tx, {
        actorId: fixture.admin.id,
        collectionKey: 'media',
        ...copied,
        sourcePath: '$file',
        authorizedManifest: resolved.authorizedManifest,
      }),
    ),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(
    fixture.assets.api.cancelUpload(context(fixture.owner.token), {
      collection: 'media',
      uploadId: ready.id,
    }),
  ).rejects.toMatchObject({ code: 'resource_in_use' });
  expect(
    await fixture.assets.participants.hasPendingWork(fixture.database, {
      documentId: media.documentId,
    }),
  ).toBe(false);
});

it('releases all document references atomically and detects corrupted download bytes', async () => {
  const fixture = await createFixture();
  const ready = await readyUpload(fixture);
  const media = await fixture.revision();
  await fixture.database.transaction((tx) =>
    fixture.assets.participants.bind(tx, {
      actorId: fixture.admin.id,
      collectionKey: 'media',
      ...media,
      sourcePath: '$file',
      uploadId: ready.id,
    }),
  );
  const entry = fixture.memory.objects.entries().next().value;
  if (!entry) throw new Error('Missing stored object');
  fixture.memory.objects.set(entry[0], new Uint8Array([1, 2, 3]));
  const download = await fixture.assets.api.download(context(fixture.owner.token), {
    collection: 'media',
    id: media.documentId,
  });
  await expect(new Response(download.stream).arrayBuffer()).rejects.toThrow('invalid input');
  await fixture.database.transaction((tx) =>
    fixture.assets.participants.releaseDocument(tx, { documentId: media.documentId }),
  );
  expect(
    await fixture.assets.participants.listBindings(fixture.database, {
      revisionId: media.revisionId,
    }),
  ).toEqual([]);
  await expect(
    fixture.assets.participants.readManifest(fixture.database, {
      manifestId: '00000000-0000-4000-8000-000000000000',
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
});

it('rejects invalid runtime budgets before allocating resources and stops new uploads during shutdown', async () => {
  const fixture = await createFixture();
  expect(() =>
    createAssets({ ...fixture.options, limits: { ...fixture.options.limits, maxUploadBytes: 0 } }),
  ).toThrow('invalid input');
  expect(() =>
    createAssets({ ...fixture.options, limits: { ...fixture.options.limits, leaseMs: 1 } }),
  ).toThrow('invalid input');
  const session = await fixture.assets.api.createUpload(context(fixture.owner.token), {
    collection: 'media',
    purpose: 'create',
    filename: 'shutdown.pdf',
    mimeType: 'application/pdf',
    bytes: pdf.byteLength,
  });
  fixture.assets.stop();
  await expect(
    fixture.assets.api.writeUpload(
      context(fixture.owner.token),
      { collection: 'media', uploadId: session.id },
      stream(pdf),
    ),
  ).rejects.toThrow(/./);
});

it('persists bounded cleanup failures and retries a blocked ledger only through explicit reconciliation', async () => {
  const fixture = await createFixture({ limits: { jobAttempts: 1 } });
  const ready = await readyUpload(fixture);
  await fixture.assets.api.cancelUpload(context(fixture.owner.token), {
    collection: 'media',
    uploadId: ready.id,
  });
  await fixture.database.query(
    "UPDATE asset_manifests SET retain_until=clock_timestamp()-interval '1 second'",
  );
  await fixture.database.query(
    "UPDATE asset_objects SET retain_until=clock_timestamp()-interval '1 second',write_deadline=clock_timestamp()-interval '1 second'",
  );
  const remove = fixture.options.storage.remove.bind(fixture.options.storage);
  fixture.options.storage.remove = () =>
    Promise.reject(new Error('Programmable storage deletion failure'));
  await fixture.assets.maintenance();
  const failed = await fixture.database.query<{
    cleanup_blocked: boolean;
    cleanup_attempts: number;
    cleanup_failure_code: string;
  }>('SELECT cleanup_blocked,cleanup_attempts,cleanup_failure_code FROM asset_objects');
  expect(failed.rows[0]).toEqual({
    cleanup_blocked: true,
    cleanup_attempts: 1,
    cleanup_failure_code: 'temporarily_unavailable',
  });
  fixture.options.storage.remove = remove;
  await fixture.assets.maintenance();
  expect(fixture.memory.objects.size).toBe(1);
  expect(await fixture.assets.reconcileCleanup()).toEqual({ retried: 1, cleaned: 1 });
  expect(fixture.memory.objects.size).toBe(0);
  expect(
    (
      await fixture.database.query<{ state: string; cleanup_failure_code: string | null }>(
        'SELECT state,cleanup_failure_code FROM asset_objects',
      )
    ).rows[0],
  ).toEqual({ state: 'deleted', cleanup_failure_code: null });
});

it('times out a real stalled S3 DELETE, keeps a blocked failure ledger and resumes explicit recovery', async () => {
  const storage = await createTestS3({ timeoutMs: 200 });
  try {
    const fixture = await createFixture({ storage: storage.driver, limits: { jobAttempts: 1 } });
    const ready = await readyUpload(fixture);
    await fixture.assets.api.cancelUpload(context(fixture.owner.token), {
      collection: 'media',
      uploadId: ready.id,
    });
    await fixture.database.query(
      "UPDATE asset_manifests SET retain_until=clock_timestamp()-interval '1 second'",
    );
    await fixture.database.query(
      "UPDATE asset_objects SET retain_until=clock_timestamp()-interval '1 second',write_deadline=clock_timestamp()-interval '1 second'",
    );
    storage.setDeleteStalled(true);
    await fixture.assets.maintenance();
    expect(
      (
        await fixture.database.query<{ cleanup_blocked: boolean; cleanup_failure_code: string }>(
          'SELECT cleanup_blocked,cleanup_failure_code FROM asset_objects',
        )
      ).rows[0],
    ).toEqual({ cleanup_blocked: true, cleanup_failure_code: 'temporarily_unavailable' });
    expect(storage.objects.size).toBe(1);
    storage.setDeleteStalled(false);
    expect(await fixture.assets.reconcileCleanup()).toEqual({ retried: 1, cleaned: 0 });
    expect(storage.objects.size).toBe(0);
    expect(
      (
        await fixture.database.query<{ state: string; cleanup_blocked: boolean }>(
          'SELECT state,cleanup_blocked FROM asset_objects',
        )
      ).rows[0],
    ).toEqual({ state: 'deleting', cleanup_blocked: false });
  } finally {
    await storage.close();
  }
}, 5000);
