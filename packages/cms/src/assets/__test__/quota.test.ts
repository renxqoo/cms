import { expect, it } from 'vitest';
import { context, createFixture, pdf } from './support.ts';

const upload = {
  collection: 'media',
  purpose: 'create',
  filename: 'quota.pdf',
  mimeType: 'application/pdf',
  bytes: pdf.byteLength,
};

it('serializes competing session admission and reclaims expired/cancelled declared capacity', async () => {
  const fixture = await createFixture({ limits: { maxActiveSessionsPerActor: 1 } });
  const first = fixture.assets.api.createUpload(context(fixture.owner.token), upload);
  const second = fixture.assets.api.createUpload(context(fixture.owner.token), upload);
  const results = await Promise.allSettled([first, second]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toMatchObject([
    { reason: { code: 'capacity_exceeded' } },
  ]);
  await fixture.database.query(
    "UPDATE asset_uploads SET expires_at=clock_timestamp()-interval '1 second'",
  );
  const admitted = await fixture.assets.api.createUpload(context(fixture.owner.token), upload);
  await fixture.assets.api.cancelUpload(context(fixture.owner.token), {
    collection: 'media',
    uploadId: admitted.id,
  });
  expect(await fixture.assets.api.createUpload(context(fixture.owner.token), upload)).toMatchObject(
    { status: 'pending' },
  );
});

it.each(['maxActiveSessions', 'maxActiveBytesPerActor', 'maxActiveBytes'] as const)(
  'enforces the independent %s budget',
  async (field) => {
    const value = field === 'maxActiveSessions' ? 1 : pdf.byteLength;
    const fixture = await createFixture({ limits: { [field]: value } });
    await fixture.assets.api.createUpload(context(fixture.owner.token), upload);
    await expect(
      fixture.assets.api.createUpload(context(fixture.owner.token), upload),
    ).rejects.toMatchObject({ code: 'capacity_exceeded' });
  },
);
