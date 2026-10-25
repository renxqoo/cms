import { expect } from 'vitest';
import { z } from 'zod';

export interface ApiOptions {
  token?: string;
  body?: unknown;
  key?: string;
}
export type ApiClient = (
  method: string,
  path: string,
  options?: ApiOptions,
) => Promise<Response> | Response;

export const contentDocument = z.object({
  id: z.uuid(),
  collection: z.string(),
  revision: z.number(),
  versionId: z.uuid(),
  publishedVersionId: z.uuid().nullable(),
  trashedAt: z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
  file: z.object({ id: z.uuid(), digest: z.string() }).optional(),
  mediaBindings: z.array(z.object({ bindingId: z.uuid(), sourcePath: z.string() })).optional(),
});

export async function bindOperations(
  client: ApiClient,
  input: { token: string; collection: string; code: string; operations: readonly string[] },
): Promise<string> {
  const response = await client('POST', '/v1/permissions', {
    token: input.token,
    body: {
      code: input.code,
      name: input.code,
      scopeKind: 'collection',
      collectionKey: input.collection,
    },
  });
  expect(response.status).toBe(201);
  const permission = z.object({ id: z.uuid() }).parse(await response.json());
  for (const operationId of input.operations) {
    const binding = await client('POST', '/v1/endpoint-bindings', {
      token: input.token,
      body: {
        operationId,
        scopeKind: 'collection',
        collectionKey: input.collection,
        permissionId: permission.id,
      },
    });
    expect(binding.status).toBe(201);
  }
  return permission.id;
}

export async function waitForJob(
  client: ApiClient,
  input: { token: string; collection: string; jobId: string; status: string },
) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const response = await client(
      'GET',
      `/v1/collections/${input.collection}/jobs/${input.jobId}`,
      { token: input.token },
    );
    expect(response.status).toBe(200);
    const result = z
      .object({ status: z.string() })
      .passthrough()
      .parse(await response.json());
    if (result.status === input.status) return result;
    if (['failed', 'cancelled', 'succeeded', 'partial'].includes(result.status))
      throw new Error(`Unexpected task state: ${result.status}`);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 250);
    });
  }
  throw new Error('Persistent task did not settle');
}
