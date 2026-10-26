import { afterEach, expect, it } from 'vitest';
import { oauthFailure } from '@new-cms/cms/identity';
import { contentActor } from '../../../../../../test/support/content-actor.ts';
import { contentContext } from '../../../../../../test/support/content-runtime.ts';
import {
  beginUpload,
  byteStream,
  queueUpload,
  uploadGrants,
  authorizationCode,
  createDelegationWorld,
  exchangeCode,
  grant,
  issueKey,
  managementGrants,
  secondOwner,
} from './delegation-security-support.ts';
import type { DelegationWorld } from './delegation-security-support.ts';

const fixtures: DelegationWorld[] = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.close();
});
async function world(input: Parameters<typeof createDelegationWorld>[0] = {}) {
  const fixture = await createDelegationWorld(input);
  fixtures.push(fixture);
  return fixture;
}

it('rejects a role-exceeding or duplicate requested tuple atomically instead of storing future authority', async () => {
  const kit = await world();
  const reader = await contentActor(kit, ['articles:documents.get']);
  for (const grants of [
    [grant('documents.get', 'articles'), grant('documents.get', 'pages')],
    [grant('documents.get', 'articles'), grant('roles.list')],
    [grant('documents.get', 'articles'), grant('documents.get', 'articles')],
  ]) {
    await expect(
      kit.access.api.createApiKey(reader.ctx(), {
        name: 'Rejected upper bound',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        grants,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  }
  await expect(
    kit.access.api.createApiKey(reader.ctx(), {
      name: 'Too many grant tuples',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      grants: Array.from({ length: 1001 }, () => grant('documents.get', 'articles')),
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect(await kit.access.api.listCredentials(reader.ctx(), {})).toMatchObject({
    rows: [],
    total: 0,
  });
  const accepted = await issueKey(kit, {
    ctx: reader.ctx(),
    grants: [grant('documents.get', 'articles')],
  });
  expect(accepted.credential.grants).toEqual([grant('documents.get', 'articles')]);
});

it('applies current role permission contraction immediately to an already issued access token', async () => {
  const kit = await world();
  const article = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Private article' },
  });
  const reader = await contentActor(kit, ['articles:documents.get']);
  const key = await issueKey(kit, {
    ctx: reader.ctx(),
    grants: [grant('documents.get', 'articles')],
  });
  expect(
    (await kit.content.api.getDocument(key.ctx(), { collection: 'articles', id: article.id })).data
      .title,
  ).toBe('Private article');
  await kit.access.api.replaceRolePermissions(kit.owner(), {
    id: reader.role.id,
    version: reader.role.version,
    permissionIds: [],
  });
  await expect(
    kit.content.api.getDocument(key.ctx(), { collection: 'articles', id: article.id }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  const operations = await kit.access.api.myOperations(key.ctx(), { pageSize: 100 });
  expect(operations.rows.map((row) => row.operationId)).not.toContain('documents.get');
  expect(await kit.access.api.me(key.ctx(), {})).toMatchObject({ roleId: reader.role.id });
});

it('allows only self and descendant management and hides ancestors, siblings and another owner', async () => {
  const kit = await world();
  const root = await issueKey(kit, { name: 'Root' });
  const sibling = await issueKey(kit, { name: 'Sibling' });
  const child = await issueKey(kit, {
    ctx: root.ctx(),
    name: 'Child',
    expiresAt: root.credential.expiresAt,
  });
  const descendant = await issueKey(kit, {
    ctx: child.ctx(),
    name: 'Descendant',
    expiresAt: child.credential.expiresAt,
  });
  const otherOwner = await secondOwner(kit);
  const foreign = await issueKey(kit, { ctx: otherOwner.ctx(), name: 'Foreign owner' });
  const visible = await kit.access.api.listCredentials(child.ctx(), { pageSize: 100 });
  expect(visible.total).toBe(2);
  expect(visible.rows.map((row) => row.id).toSorted()).toEqual(
    [child.credential.id, descendant.credential.id].toSorted(),
  );
  for (const id of [root.credential.id, sibling.credential.id, foreign.credential.id]) {
    await expect(kit.access.api.revokeCredential(child.ctx(), { id })).rejects.toMatchObject({
      code: 'not_found',
    });
  }
  await kit.access.api.revokeCredential(child.ctx(), { id: descendant.credential.id });
  expect(
    (await kit.access.api.listCredentials(root.ctx(), {})).rows.find(
      (row) => row.id === descendant.credential.id,
    )?.status,
  ).toBe('revoked');
  expect(await kit.access.api.me(sibling.ctx(), {})).toHaveProperty('id');
  expect(await kit.access.api.me(foreign.ctx(), {})).toMatchObject({ id: otherOwner.account.id });
  await kit.access.api.revokeCredential(child.ctx(), { id: child.credential.id });
  await expect(kit.access.api.me(child.ctx(), {})).rejects.toMatchObject({
    code: 'unauthenticated',
  });
  expect(await kit.access.api.me(root.ctx(), {})).toHaveProperty('id');
});

it('limits an application-wide revocation to the caller delegation subtree', async () => {
  const kit = await world();
  const root = await issueKey(kit);
  const childRequest = await authorizationCode(kit, { ctx: root.ctx(), name: 'Child OAuth login' });
  const child = await exchangeCode(kit, childRequest);
  const independent = await exchangeCode(
    kit,
    await authorizationCode(kit, { name: 'Independent OAuth login' }),
  );
  const foreignOwner = await secondOwner(kit);
  const foreign = await exchangeCode(
    kit,
    await authorizationCode(kit, { ctx: foreignOwner.ctx(), name: 'Other owner CLI login' }),
  );
  expect(await kit.access.api.revokeClientGrants(root.ctx(), { clientId: 'cms-cli' })).toEqual({
    revoked: 1,
  });
  await expect(kit.access.api.me(contentContext(child.access_token), {})).rejects.toMatchObject({
    code: 'unauthenticated',
  });
  expect(await kit.access.api.me(contentContext(independent.access_token), {})).toHaveProperty(
    'id',
  );
  expect(await kit.access.api.me(contentContext(foreign.access_token), {})).toMatchObject({
    id: foreignOwner.account.id,
  });
  const remaining = await kit.access.api.listCredentials(kit.owner(), { kind: 'oauth' });
  expect(remaining.rows.find((row) => row.name === 'Independent OAuth login')?.status).toBe(
    'active',
  );
});

it.each(['revoked', 'expired'] as const)(
  'rejects an otherwise live descendant after an ancestor becomes %s',
  async (state) => {
    const kit = await world();
    const root = await issueKey(kit);
    const child = await issueKey(kit, { ctx: root.ctx(), expiresAt: root.credential.expiresAt });
    const descendant = await issueKey(kit, {
      ctx: child.ctx(),
      expiresAt: child.credential.expiresAt,
    });
    expect(await kit.access.api.me(descendant.ctx(), {})).toHaveProperty('id');
    if (state === 'revoked')
      await kit.access.api.revokeCredential(kit.owner(), { id: root.credential.id });
    else
      await kit.database.query(
        "UPDATE credential_grants SET created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' WHERE id=$1",
        [root.credential.id],
      );
    await expect(kit.access.api.me(descendant.ctx(), {})).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(
      kit.oauth.exchange(contentContext(), {
        token: descendant.apiKey,
        bridgeSecret: kit.config.bridgeSecret,
      }),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  },
);

it('rejects children that add authority or outlive the parent and caps the chain at four credentials', async () => {
  const kit = await world();
  const root = await issueKey(kit);
  await expect(
    kit.access.api.createApiKey(root.ctx(), {
      name: 'Escalated child',
      expiresAt: root.credential.expiresAt,
      grants: [...managementGrants, grant('roles.list')],
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(
    kit.access.api.createApiKey(root.ctx(), {
      name: 'Long-lived child',
      expiresAt: new Date(Date.parse(root.credential.expiresAt) + 1000).toISOString(),
      grants: managementGrants,
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  let parent = root;
  for (const name of ['Second level', 'Third level', 'Fourth level'])
    parent = await issueKey(kit, { ctx: parent.ctx(), name, expiresAt: root.credential.expiresAt });
  expect((await kit.access.api.listCredentials(kit.owner(), {})).total).toBe(4);
  await expect(
    kit.access.api.createApiKey(parent.ctx(), {
      name: 'Fifth level',
      expiresAt: root.credential.expiresAt,
      grants: managementGrants,
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  expect((await kit.access.api.listCredentials(kit.owner(), {})).total).toBe(4);
});

it('counts both live credentials and retained revoked records against their configured budgets', async () => {
  const kit = await world({ maxActiveGrants: 2, maxRetainedGrants: 3 });
  const first = await issueKey(kit, { name: 'First' });
  const second = await issueKey(kit, { name: 'Second' });
  await expect(issueKey(kit, { name: 'Above live limit' })).rejects.toMatchObject({
    code: 'capacity_exceeded',
  });
  await kit.access.api.revokeCredential(kit.owner(), { id: first.credential.id });
  await issueKey(kit, { name: 'Third retained' });
  await kit.access.api.revokeCredential(kit.owner(), { id: second.credential.id });
  await expect(issueKey(kit, { name: 'Above retained limit' })).rejects.toMatchObject({
    code: 'capacity_exceeded',
  });
  const retained = await kit.access.api.listCredentials(kit.owner(), {});
  expect(retained.total).toBe(3);
  expect(retained.rows.filter((row) => row.status === 'revoked')).toHaveLength(2);
});

it.each(['authorization_code', 'refresh_token'] as const)(
  'allows only one concurrent %s exchange and commits replay revocation',
  async (flow) => {
    const kit = await world();
    const code = await authorizationCode(kit);
    let exchange = () => exchangeCode(kit, code);
    if (flow === 'refresh_token') {
      const initial = await exchangeCode(kit, code);
      exchange = () =>
        kit.oauth.token(contentContext(), {
          grant_type: 'refresh_token',
          client_id: 'cms-cli',
          refresh_token: initial.refresh_token,
        });
    }
    const results = await Promise.allSettled([exchange(), exchange()]);
    const successes = results.filter((result) => result.status === 'fulfilled');
    const failures = results.filter((result) => result.status === 'rejected');
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures.map((failure) => oauthFailure(failure.reason))).toEqual([
      { error: 'invalid_grant', status: 400 },
    ]);
    for (const success of successes)
      await expect(
        kit.access.api.me(contentContext(success.value.access_token), {}),
      ).rejects.toMatchObject({ code: 'unauthenticated' });
  },
);

it.each(['write', 'complete'] as const)(
  'regression: a browser cannot %s an upload after its original delegated source is revoked',
  async (operation) => {
    const kit = await world();
    const source = await issueKey(kit, { grants: uploadGrants });
    const upload = await beginUpload(kit, source.ctx());
    if (operation === 'complete')
      await kit.assets.api.writeUpload(
        source.ctx(),
        { collection: 'media', uploadId: upload.id },
        byteStream(),
      );
    await kit.access.api.revokeCredential(kit.owner(), { id: source.credential.id });
    const result =
      operation === 'write'
        ? kit.assets.api.writeUpload(
            kit.owner(),
            { collection: 'media', uploadId: upload.id },
            byteStream(),
          )
        : kit.assets.api.completeUpload(kit.owner(), { collection: 'media', uploadId: upload.id });
    await expect(result).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(
      await kit.assets.api.readUpload(kit.owner(), { collection: 'media', uploadId: upload.id }),
    ).toMatchObject({ status: operation === 'write' ? 'pending' : 'uploading' });
    await kit.assets.api.cancelUpload(kit.owner(), { collection: 'media', uploadId: upload.id });
    expect(
      await kit.assets.api.readUpload(kit.owner(), { collection: 'media', uploadId: upload.id }),
    ).toMatchObject({ status: 'cancelled' });
  },
);

it('processes an upload when both its original and completing delegated sources remain valid', async () => {
  const kit = await world();
  const upload = await queueUpload(kit);
  const persisted = await kit.database.query<{
    upload_source: string | null;
    job_source: string | null;
  }>(
    'SELECT u.delegation_id AS upload_source,j.delegation_id AS job_source FROM asset_uploads u JOIN asset_jobs j ON j.id=u.job_id WHERE u.id=$1',
    [upload.upload.id],
  );
  expect(persisted.rows).toEqual([
    { upload_source: upload.source.credential.id, job_source: upload.completer.credential.id },
  ]);
  await kit.assets.process();
  expect(
    await kit.assets.api.readUpload(kit.owner(), {
      collection: 'media',
      uploadId: upload.upload.id,
    }),
  ).toMatchObject({ status: 'ready' });
});

it.each(['original', 'completing'] as const)(
  'regression: final upload processing fails when the %s delegated source is revoked after queueing',
  async (revoked) => {
    const kit = await world();
    const upload = await queueUpload(kit);
    const id =
      revoked === 'original' ? upload.source.credential.id : upload.completer.credential.id;
    await kit.access.api.revokeCredential(kit.owner(), { id });
    await kit.assets.process();
    expect(
      await kit.assets.api.readUpload(kit.owner(), {
        collection: 'media',
        uploadId: upload.upload.id,
      }),
    ).toMatchObject({ status: 'failed', failureCode: 'unauthenticated' });
    const result = await kit.database.query<{
      status: string;
      manifest_id: string | null;
      delegation_id: string | null;
    }>('SELECT status,manifest_id,delegation_id FROM asset_jobs WHERE upload_id=$1', [
      upload.upload.id,
    ]);
    expect(result.rows).toEqual([
      { status: 'failed', manifest_id: null, delegation_id: upload.completer.credential.id },
    ]);
  },
);

it('regression: a browser cannot consume a ready upload after its original delegated source is revoked', async () => {
  const kit = await world();
  const uploaded = await queueUpload(kit);
  await kit.assets.process();
  expect(
    await kit.assets.api.readUpload(kit.owner(), {
      collection: 'media',
      uploadId: uploaded.upload.id,
    }),
  ).toMatchObject({ status: 'ready' });
  await kit.access.api.revokeCredential(kit.owner(), { id: uploaded.source.credential.id });
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'media',
      uploadId: uploaded.upload.id,
      data: { title: 'Must not be created' },
    }),
  ).rejects.toMatchObject({ code: 'unauthenticated' });
  expect(await kit.content.api.listDocuments(kit.owner(), { collection: 'media' })).toMatchObject({
    rows: [],
    total: 0,
  });
  expect(
    await kit.assets.api.readUpload(kit.owner(), {
      collection: 'media',
      uploadId: uploaded.upload.id,
    }),
  ).toMatchObject({ status: 'ready' });
});

it('retains non-null task and upload source UUIDs after cleanup and denies missing-grant work while access-token expiry alone permits work', async () => {
  const kit = await world();
  const key = await issueKey(kit, {
    grants: [
      ...uploadGrants,
      grant('content.schedulePublication', 'articles'),
      grant('documents.publish', 'articles'),
      grant('documents.get', 'articles'),
    ],
  });
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Survives access token expiry' },
  });
  const second = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Cannot publish without original grant' },
  });
  const schedule = (document: typeof first) =>
    kit.content.api.schedulePublication(key.ctx(), {
      collection: 'articles',
      id: document.id,
      revision: document.revision,
      versionId: document.versionId,
      executeAt: new Date(Date.now() + 60_000).toISOString(),
    });
  const allowed = await schedule(first);
  const blocked = await schedule(second);
  const upload = await beginUpload(kit, key.ctx());
  await kit.assets.api.writeUpload(
    key.ctx(),
    { collection: 'media', uploadId: upload.id },
    byteStream(),
  );
  await kit.assets.api.completeUpload(key.ctx(), { collection: 'media', uploadId: upload.id });
  await kit.database.query(
    "UPDATE credential_tokens SET created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' WHERE grant_id=$1",
    [key.credential.id],
  );
  await expect(kit.access.api.me(key.ctx(), {})).rejects.toMatchObject({ code: 'unauthenticated' });
  await kit.database.query('UPDATE content_jobs SET execute_at=clock_timestamp() WHERE id=$1', [
    allowed.jobId,
  ]);
  await kit.content.maintenance();
  expect(
    await kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: allowed.jobId }),
  ).toMatchObject({ status: 'succeeded', succeeded: 1 });
  expect(
    (
      await kit.content.api.getDocument(kit.owner(), {
        collection: 'articles',
        id: first.id,
        mode: 'published',
      })
    ).data.title,
  ).toBe('Survives access token expiry');
  await kit.access.api.revokeCredential(kit.owner(), { id: key.credential.id });
  await kit.database.query(
    "UPDATE credential_grants SET created_at=clock_timestamp()-interval '10 days',revoked_at=clock_timestamp()-interval '8 days' WHERE id=$1",
    [key.credential.id],
  );
  await kit.identity.maintenance();
  expect(
    (await kit.database.query('SELECT id FROM credential_grants WHERE id=$1', [key.credential.id]))
      .rowCount,
  ).toBe(0);
  const origins = await kit.database.query<{ source: string | null }>(
    'SELECT delegation_id AS source FROM content_jobs WHERE id=$1 UNION ALL SELECT delegation_id FROM asset_uploads WHERE id=$2 UNION ALL SELECT delegation_id FROM asset_jobs WHERE upload_id=$2',
    [blocked.jobId, upload.id],
  );
  expect(origins.rows).toEqual([
    { source: key.credential.id },
    { source: key.credential.id },
    { source: key.credential.id },
  ]);
  await kit.database.query('UPDATE content_jobs SET execute_at=clock_timestamp() WHERE id=$1', [
    blocked.jobId,
  ]);
  await kit.content.maintenance();
  await kit.assets.process();
  expect(
    await kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: blocked.jobId }),
  ).toMatchObject({
    status: 'failed',
    failed: 1,
    items: [{ status: 'failed', error: { code: 'unauthenticated' } }],
  });
  await expect(
    kit.content.api.getDocument(kit.owner(), {
      collection: 'articles',
      id: second.id,
      mode: 'published',
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
  expect(
    await kit.assets.api.readUpload(kit.owner(), { collection: 'media', uploadId: upload.id }),
  ).toMatchObject({ status: 'failed', failureCode: 'unauthenticated', manifest: null });
  const retainedOrigins = await kit.database.query<{ source: string | null }>(
    'SELECT delegation_id AS source FROM content_jobs WHERE id=$1 UNION ALL SELECT delegation_id FROM asset_uploads WHERE id=$2 UNION ALL SELECT delegation_id FROM asset_jobs WHERE upload_id=$2',
    [blocked.jobId, upload.id],
  );
  expect(retainedOrigins.rows).toEqual([
    { source: key.credential.id },
    { source: key.credential.id },
    { source: key.credential.id },
  ]);
});

it('keeps a successfully used DCR client expiry finite and reclaims it after its grant and requests expire', async () => {
  const kit = await world({ maxClients: 1 });
  const redirectUri = 'https://registered-client.example.test/callback';
  const client = await kit.oauth.register(contentContext(), {
    client_name: 'Finite-lived DCR client',
    redirect_uris: [redirectUri],
    grant_types: ['authorization_code', 'refresh_token'],
    scope: 'cms offline_access',
    token_endpoint_auth_method: 'none',
  });
  const before = await kit.database.query<{ expires_at: Date | null }>(
    'SELECT expires_at FROM oauth_clients WHERE id=$1',
    [client.client_id],
  );
  expect(Number.isFinite(before.rows[0]?.expires_at?.getTime())).toBe(true);
  const tokens = await exchangeCode(
    kit,
    await authorizationCode(kit, { clientId: client.client_id, redirectUri }),
  );
  expect(await kit.access.api.me(contentContext(tokens.access_token), {})).toHaveProperty('id');
  const used = await kit.database.query<{ expires_at: Date | null }>(
    'SELECT expires_at FROM oauth_clients WHERE id=$1',
    [client.client_id],
  );
  expect(Number.isFinite(used.rows[0]?.expires_at?.getTime())).toBe(true);
  expect(used.rows[0]?.expires_at?.getTime()).toBeGreaterThan(
    before.rows[0]?.expires_at?.getTime() ?? Number.POSITIVE_INFINITY,
  );
  const listing = await kit.access.api.listCredentials(kit.owner(), { kind: 'oauth' });
  expect(listing.rows).toHaveLength(1);
  const [credential] = listing.rows;
  if (!credential) throw new Error('Expected the registered client delegation.');
  await kit.database.query(
    "UPDATE credential_tokens SET created_at=clock_timestamp()-interval '10 days',expires_at=clock_timestamp()-interval '9 days' WHERE grant_id=$1",
    [credential.id],
  );
  await kit.database.query(
    "UPDATE oauth_requests SET created_at=clock_timestamp()-interval '10 days',expires_at=clock_timestamp()-interval '9 days' WHERE client_id=$1",
    [client.client_id],
  );
  await kit.database.query(
    "UPDATE credential_grants SET created_at=clock_timestamp()-interval '10 days',expires_at=clock_timestamp()-interval '9 days' WHERE id=$1",
    [credential.id],
  );
  await kit.database.query(
    "UPDATE oauth_clients SET expires_at=clock_timestamp()-interval '1 day' WHERE id=$1",
    [client.client_id],
  );
  await kit.identity.maintenance();
  expect(
    (await kit.database.query('SELECT id FROM oauth_clients WHERE id=$1', [client.client_id]))
      .rowCount,
  ).toBe(0);
  expect((await kit.access.api.listCredentials(kit.owner(), { kind: 'oauth' })).total).toBe(0);
  const again = await kit.oauth
    .authorize(contentContext(), {
      response_type: 'code',
      client_id: client.client_id,
      redirect_uri: redirectUri,
    })
    .catch(oauthFailure);
  expect(again).toEqual({ error: 'invalid_client', status: 401 });
  const replacement = await kit.oauth.register(contentContext(), {
    client_name: 'Replacement DCR client',
    redirect_uris: [redirectUri],
    grant_types: ['authorization_code'],
    scope: 'cms',
    token_endpoint_auth_method: 'none',
  });
  expect(replacement.client_id).not.toBe(client.client_id);
});
