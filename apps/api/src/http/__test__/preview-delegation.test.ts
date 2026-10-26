import { afterEach, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { api, createHttpFixture } from './support.ts';
import type { HttpFixture } from './support.ts';
import { bindPublicCollections } from './native-publication-support.ts';

let fixture: HttpFixture | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});
const grants = ['documents.get', 'documents.createPreviewTicket'].map((operationId) => ({
  operationId,
  scopeKind: 'collection',
  collectionKey: 'models',
}));
const accessToken = z.object({ access_token: z.string() });
const privateSlug = 'unreleased-private-preview';
async function draft(kit: HttpFixture) {
  await bindPublicCollections(kit, ['models']);
  const created = await api(kit)('POST', '/v1/collections/models/documents', {
    body: {
      locale: 'en',
      data: {
        modelId: 'Private/Model',
        slug: privateSlug,
        title: 'Unreleased private title',
        summary: 'Private model summary',
        contentLocales: ['en'],
        primaryCategory: 'text',
        technicalCapabilities: {
          inputs: ['text'],
          outputs: ['text'],
          tasks: ['chat'],
          features: [],
        },
        apiBindings: [],
        presentation: { sortOrder: 0, featured: false },
      },
    },
  });
  expect(created.status).toBe(201);
  return z.object({ id: z.uuid(), revision: z.number() }).parse(await created.json());
}
async function bridge(kit: HttpFixture, token: string) {
  const response = await kit.runtime.app.request('http://localhost/oauth/exchange', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'x-cms-mcp-secret': kit.config.oauth.bridgeSecret,
    },
  });
  expect(response.status).toBe(200);
  return accessToken.parse(await response.json()).access_token;
}
async function oauth(kit: HttpFixture, resource: string) {
  const verifier = 'p'.repeat(64);
  const redirectUri = 'http://127.0.0.1:49236/callback';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: 'cms-cli',
    redirect_uri: redirectUri,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    scope: 'cms offline_access',
    resource,
  });
  const started = await kit.runtime.app.request(`http://localhost/oauth/authorize?${params}`);
  expect(started.status).toBe(302);
  const requestId = new URL(started.headers.get('location') ?? '').searchParams.get('request');
  const decision = await api(kit)('POST', `/v1/oauth/requests/${requestId}/decisions`, {
    body: { approved: true, grants },
  });
  expect(decision.status).toBe(200);
  const { redirectTo } = z.object({ redirectTo: z.string() }).parse(await decision.json());
  const response = await kit.runtime.app.request('http://localhost/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: 'cms-cli',
      code: new URL(redirectTo).searchParams.get('code') ?? '',
      code_verifier: verifier,
      redirect_uri: redirectUri,
      resource,
    }),
  });
  expect(response.status).toBe(200);
  return accessToken.parse(await response.json()).access_token;
}
async function apiKey(kit: HttpFixture) {
  const created = await api(kit)('POST', '/v1/me/api-keys', {
    body: {
      name: 'Preview scope',
      grants,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    },
  });
  expect(created.status).toBe(201);
  const { apiKey: token } = z.object({ apiKey: z.string() }).parse(await created.json());
  return bridge(kit, token);
}
async function credential(kit: HttpFixture, kind: string) {
  if (kind === 'api-key') return apiKey(kit);
  const token = await oauth(
    kit,
    kind === 'api-oauth' ? kit.config.oauth.issuer : kit.config.oauth.mcpResource,
  );
  return kind === 'api-oauth' ? token : bridge(kit, token);
}
it.each(['api-key', 'api-oauth', 'mcp-oauth'])(
  'rejects %s preview sharing before writing a ticket or leaking draft metadata',
  async (kind) => {
    const kit = await createHttpFixture();
    fixture = kit;
    const model = await draft(kit);
    const token = await credential(kit, kind);
    const path = `/v1/collections/models/documents/${model.id}`;
    expect((await api(kit)('GET', path, { token })).status).toBe(200);
    const response = await api(kit)('POST', `${path}/preview-tickets`, {
      token,
      body: { locale: 'en', expectedRevision: model.revision },
    });
    expect(response.status).toBe(403);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ error: { code: 'forbidden' } });
    expect(JSON.stringify(body)).not.toContain(privateSlug);
    expect(JSON.stringify(body)).not.toContain('Unreleased private title');
    expect(body).not.toHaveProperty('url');
    const tickets = await kit.store.database.query('SELECT id FROM content_preview_grants');
    expect(tickets.rows).toEqual([]);
    const audit = await kit.store.database.query(
      "SELECT id FROM audit_events WHERE operation_id='documents.createPreviewTicket'",
    );
    expect(audit.rows).toEqual([]);
    expect((await api(kit)('GET', path, { token })).status).toBe(200);
  },
);
it('preserves interactive session issuance, current issuer reading and ticket revocation', async () => {
  const kit = await createHttpFixture();
  fixture = kit;
  const model = await draft(kit);
  const path = `/v1/collections/models/documents/${model.id}/preview-tickets`;
  const issued = await api(kit)('POST', path, {
    body: { locale: 'en', expectedRevision: model.revision },
  });
  expect(issued.status).toBe(201);
  const ticket = z.object({ ticketId: z.uuid(), url: z.url() }).parse(await issued.json());
  const grant = new URL(ticket.url).searchParams.get('grant');
  if (!grant) throw new Error('Missing preview grant');
  const input = { token: grant };
  const preview = `/v1/preview/models/${privateSlug}?locale=en`;
  const read = await api(kit)('GET', preview, input);
  expect(read.status).toBe(200);
  expect(await read.json()).toMatchObject({
    data: { model: { title: 'Unreleased private title' } },
  });
  expect((await api(kit)('DELETE', `${path}/${ticket.ticketId}`)).status).toBe(200);
  expect((await api(kit)('GET', preview, input)).status).toBe(401);
});
