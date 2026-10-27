import { beforeRequest } from '@renxqoo/agent-cli-sdk';
import type { CommandContext, Plugin, RequestOptions } from '@renxqoo/agent-cli-sdk';
import { z } from 'zod';
import { createApiClient, ApiError, editorSessionIdSchema } from '@new-cms/api-client/client';
import { accessToken } from './oauth.ts';
import { operationFor } from '@new-cms/api-client/operations';
import type { CliConfig } from './config.ts';
import type { CliState } from './commands.ts';

const requestBody = z.object({
  editorSessionId: editorSessionIdSchema.optional(),
  input: z.unknown(),
  idempotencyKey: z.string().optional(),
  bytes: z.instanceof(Uint8Array).optional(),
});

function bearerPlugin(config: CliConfig): Plugin<CliState> {
  return {
    name: 'cms-public-client-auth',
    async beforeRequest(context, request) {
      if (operationFor(request.path).access === 'public') return request;
      const token = await accessToken(config, { signal: context.state.signal });
      return { ...request, headers: { ...request.headers, authorization: `Bearer ${token}` } };
    },
  };
}

export function apiRequest(config: CliConfig, context: CommandContext<CliState>) {
  const auth = bearerPlugin(config);
  async function send(request: RequestOptions): Promise<unknown> {
    const body = requestBody.parse(request.body);
    const token = request.headers?.authorization?.slice(7);
    const client = createApiClient({
      origin: config.origin,
      timeoutMs: config.timeoutMs,
      maxResponseBytes: config.maxResponseBytes,
      maxFileBytes: config.maxFileBytes,
      ...(token ? { token } : {}),
      signal: context.state.signal,
    });
    return client.call(request.path, body.input, {
      ...(body.editorSessionId ? { editorSessionId: body.editorSessionId } : {}),
      ...(body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}),
      ...(body.bytes ? { bytes: body.bytes } : {}),
    });
  }
  return async (request: { path: string; body?: unknown }): Promise<unknown> => {
    const prepared = await beforeRequest([auth], context, { method: 'POST', ...request });
    try {
      return await send(prepared);
    } catch (error) {
      const rejectedToken = prepared.headers?.authorization?.slice(7);
      if (!(error instanceof ApiError) || error.status !== 401 || !rejectedToken || config.token)
        throw error;
      await accessToken(config, { signal: context.state.signal, rejectedToken });
      return send(await beforeRequest([auth], context, { method: 'POST', ...request }));
    }
  };
}
