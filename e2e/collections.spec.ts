import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { createCmsProcess } from '../test/support/cms-process.ts';
import { bindOperations, contentDocument, waitForJob } from '../test/support/cms-api.ts';
import { extractToken } from '../test/support/smtp.ts';

const articleOperations = [
  'collections.get',
  'documents.create',
  'documents.list',
  'documents.get',
  'documents.update',
  'documents.archive',
  'documents.restoreTrash',
  'documents.autosave',
  'versions.list',
  'versions.get',
  'versions.diff',
  'versions.restore',
  'content.schedulePublication',
  'content.getJob',
];

it.each(['bun', 'node'] as const)(
  '%s preserves published snapshots, revision conflicts and task revocation through restart',
  async (mode) => {
    const kit = await createCmsProcess(mode);
    const { request, owner } = kit;
    try {
      const manage = await bindOperations(request, {
        ...owner,
        collection: 'articles',
        code: 'content:articles:manage',
        operations: articleOperations,
      });
      const publish = await bindOperations(request, {
        ...owner,
        collection: 'articles',
        code: 'content:articles:publish',
        operations: ['documents.publish'],
      });
      await bindOperations(request, {
        ...owner,
        collection: 'pages',
        code: 'content:pages:read',
        operations: ['documents.get'],
      });
      const roleResponse = await request('POST', '/v1/roles', {
        ...owner,
        body: { code: 'content_editor', name: 'Content editor', permissionIds: [manage] },
      });
      const role = z.object({ id: z.uuid(), version: z.number() }).parse(await roleResponse.json());
      expect(
        (
          await request('POST', '/v1/admins', {
            ...owner,
            body: { email: 'content-editor@example.test', roleId: role.id },
          })
        ).status,
      ).toBe(201);
      const invitation = extractToken(await kit.smtp.waitForMessage());
      expect(
        (
          await request('POST', '/v1/auth/invitation-acceptances', {
            body: { token: invitation, newPassword: 'Content editor password 2026' },
          })
        ).status,
      ).toBe(204);
      const editorLogin = await request('POST', '/v1/auth/login', {
        body: { email: 'content-editor@example.test', password: 'Content editor password 2026' },
      });
      const editor = z.object({ token: z.string() }).parse(await editorLogin.json());
      const createKey = randomUUID();
      const create = {
        ...editor,
        key: createKey,
        body: { data: { title: 'Published title', slug: 'network-story' } },
      };
      const createdResponse = await request('POST', '/v1/collections/articles/documents', create);
      expect(createdResponse.status).toBe(201);
      const created = contentDocument.parse(await createdResponse.json());
      const path = `/v1/collections/articles/documents/${created.id}`;
      const replay = await request('POST', '/v1/collections/articles/documents', create);
      expect(contentDocument.parse(await replay.json()).id).toBe(created.id);
      expect(
        (
          await request('POST', `${path}/publications`, {
            ...editor,
            body: { revision: created.revision },
          })
        ).status,
      ).toBe(403);
      expect(
        (await request('GET', `/v1/collections/pages/documents/${created.id}`, editor)).status,
      ).toBe(403);
      const grants = await request('PUT', `/v1/roles/${role.id}/permissions`, {
        ...owner,
        body: { version: role.version, permissionIds: [manage, publish] },
      });
      const grantedRole = z.object({ version: z.number() }).parse(await grants.json());
      const publishedResponse = await request('POST', `${path}/publications`, {
        ...editor,
        body: { revision: created.revision },
      });
      expect(publishedResponse.status).toBe(200);
      const published = contentDocument.parse(await publishedResponse.json());
      const savedResponse = await request('PATCH', path, {
        ...editor,
        body: { revision: published.revision, data: { title: 'New private draft' } },
      });
      expect(savedResponse.status, await savedResponse.clone().text()).toBe(200);
      const saved = contentDocument.parse(await savedResponse.json());
      const publicView = await request('GET', `${path}?mode=published`, editor);
      expect(contentDocument.parse(await publicView.json()).data.title).toBe('Published title');
      const query = new URLSearchParams({
        mode: 'published',
        where: JSON.stringify({ field: 'title', operator: 'eq', value: 'Published title' }),
      });
      const list = await request('GET', `/v1/collections/articles/documents?${query}`, editor);
      expect(z.object({ total: z.number() }).parse(await list.json()).total).toBe(1);
      const conflicts = await Promise.all(
        ['Concurrent A', 'Concurrent B'].map((title) =>
          request('PATCH', path, {
            ...editor,
            body: { revision: saved.revision, data: { title } },
          }),
        ),
      );
      expect(
        conflicts.map((response) => response.status).toSorted((left, right) => left - right),
      ).toEqual([200, 409]);
      const current = contentDocument.parse(await (await request('GET', path, editor)).json());
      const scheduledResponse = await request('POST', `${path}/publication-schedules`, {
        ...editor,
        body: {
          revision: current.revision,
          versionId: current.versionId,
          executeAt: new Date(Date.now() + 1500).toISOString(),
        },
      });
      expect(scheduledResponse.status).toBe(202);
      const schedule = z.object({ jobId: z.uuid() }).parse(await scheduledResponse.json());
      expect(
        (
          await request('PUT', `/v1/roles/${role.id}/permissions`, {
            ...owner,
            body: { version: grantedRole.version, permissionIds: [manage] },
          })
        ).status,
      ).toBe(200);
      const failed = await waitForJob(request, {
        ...owner,
        collection: 'articles',
        jobId: schedule.jobId,
        status: 'failed',
      });
      expect(failed.failed).toBe(1);
      await kit.restart();
      expect(
        (await request('GET', `/v1/collections/articles/jobs/${schedule.jobId}`, owner)).status,
      ).toBe(200);
      const archivedResponse = await request(
        'DELETE',
        `${path}?revision=${current.revision}`,
        owner,
      );
      expect(archivedResponse.status).toBe(200);
      const archived = contentDocument.parse(await archivedResponse.json());
      expect(archived.publishedVersionId).toBeNull();
      const restoredResponse = await request('POST', `${path}/trash-restorations`, {
        ...owner,
        body: { revision: archived.revision },
      });
      expect(restoredResponse.status).toBe(200);
      const restored = contentDocument.parse(await restoredResponse.json());
      expect(restored.trashedAt).toBeNull();
      expect(restored.publishedVersionId).toBeNull();
      const roleNow = z
        .object({ version: z.number() })
        .parse(await (await request('GET', `/v1/roles/${role.id}`, owner)).json());
      expect(
        (
          await request('PUT', `/v1/roles/${role.id}/permissions`, {
            ...owner,
            body: { version: roleNow.version, permissionIds: [] },
          })
        ).status,
      ).toBe(200);
      expect((await request('GET', path, editor)).status).toBe(403);
      expect((await request('POST', '/v1/collections/articles/documents', create)).status).toBe(
        403,
      );
    } finally {
      await kit.close();
    }
  },
);
