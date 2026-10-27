import { McpServer, SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/server';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { createApiClient, ApiError, editorSessionIdSchema } from '@new-cms/api-client/client';
import { operations, compileInputSchema } from '@new-cms/api-client/operations';
import type { ApiOperation } from '@new-cms/api-client/operations';
import type { McpConfig } from './config.ts';

const allowedPage = z.object({
  rows: z.array(z.object({ operationId: z.string() })),
  total: z.number().int().nonnegative(),
});
const download = z.object({
  data: z.instanceof(Uint8Array),
  bytes: z.number(),
  filename: z.string(),
  mimeType: z.string(),
});
const discovery = ['access.me', 'access.myOperations', 'collections.list', 'resources.list'];

function toolSchema(operation: ApiOperation): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  const requiredExtras: string[] = [];
  extra.editorSessionId = {
    ...z.toJSONSchema(editorSessionIdSchema),
    description: 'Owned editor session UUID; transmitted as request context.',
  };
  if (operation.idempotency === 'required') {
    extra.idempotencyKey = { type: 'string', minLength: 16, maxLength: 128 };
    requiredExtras.push('idempotencyKey');
  }
  if (operation.transport === 'upload') {
    requiredExtras.push('base64');
    extra.base64 = {
      type: 'string',
      description:
        'File bytes encoded as canonical base64. Local paths and URLs are not supported.',
    };
  }
  function extend(schema: Record<string, unknown>): Record<string, unknown> {
    const branches = schema.anyOf;
    if (schema.type !== 'object' && Array.isArray(branches))
      return {
        ...schema,
        anyOf: branches.map((branch: Record<string, unknown>) => extend(branch)),
      };
    const properties = z.record(z.string(), z.unknown()).parse(schema.properties ?? {});
    const required = z.array(z.string()).parse(schema.required ?? []);
    return {
      ...schema,
      properties: { ...properties, ...extra },
      required: [...required, ...requiredExtras],
    };
  }
  return extend(operation.inputSchema);
}

export function decodeBase64(value: unknown, maximum: number): Uint8Array {
  if (typeof value === 'string' && value.length > Math.ceil(maximum / 3) * 4)
    throw new ApiError({ status: 413, code: 'payload_too_large' });
  if (
    typeof value !== 'string' ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  )
    throw new ApiError({ status: 400, code: 'invalid_input' });
  const bytes = Buffer.from(value, 'base64');
  if (bytes.byteLength > maximum) throw new ApiError({ status: 413, code: 'payload_too_large' });
  if (bytes.toString('base64') !== value)
    throw new ApiError({ status: 400, code: 'invalid_input' });
  return new Uint8Array(bytes);
}

function errorResult(error: unknown): CallToolResult {
  const problem =
    error instanceof ApiError
      ? { code: error.code, status: error.status, requestId: error.requestId }
      : { code: 'request_failed', status: 503, requestId: null };
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(problem) }],
    structuredContent: { error: problem },
  };
}

async function invoke(
  client: ReturnType<typeof createApiClient>,
  operation: ApiOperation,
  options: { args: unknown; signal: AbortSignal; maximum: number },
): Promise<CallToolResult> {
  try {
    const { idempotencyKey, base64, editorSessionId, ...input } = z
      .record(z.string(), z.unknown())
      .parse(options.args);
    const value = await client.call(operation.id, input, {
      ...(typeof idempotencyKey === 'string' ? { idempotencyKey } : {}),
      ...(typeof editorSessionId === 'string' ? { editorSessionId } : {}),
      ...(operation.transport === 'upload' ? { bytes: decodeBase64(base64, options.maximum) } : {}),
      signal: options.signal,
    });
    if (operation.transport !== 'download')
      return {
        content: [{ type: 'text', text: JSON.stringify(value) }],
        structuredContent: { result: value },
      };
    const file = download.parse(value);
    const metadata = { bytes: file.bytes, filename: file.filename, mimeType: file.mimeType };
    return {
      content: [{ type: 'text', text: JSON.stringify(metadata) }],
      structuredContent: {
        ...metadata,
        encoding: 'base64',
        data: Buffer.from(file.data).toString('base64'),
      },
    };
  } catch (error) {
    return errorResult(error);
  }
}

async function allowedOperations(
  client: ReturnType<typeof createApiClient>,
  config: Pick<McpConfig, 'operationPageLimit' | 'operationPageSize'>,
): Promise<Set<string>> {
  const result = new Set(discovery);
  for (let page = 1; page <= config.operationPageLimit; page++) {
    const value = allowedPage.parse(
      await client.call('access.myOperations', { page, pageSize: config.operationPageSize }),
    );
    for (const row of value.rows) result.add(row.operationId);
    if (page * config.operationPageSize >= value.total) return result;
  }
  throw new ApiError({ status: 503, code: 'capacity_exceeded' });
}

export async function createTools(config: McpConfig, token: string, signal?: AbortSignal) {
  const client = createApiClient({
    origin: config.apiOrigin,
    token,
    ...(signal ? { signal } : {}),
    timeoutMs: config.requestTimeoutMs,
    maxResponseBytes: config.responseLimitBytes,
    maxFileBytes: config.fileLimitBytes,
  });
  const allowed = await allowedOperations(client, config);
  const server = new McpServer(
    { name: 'cms', version: '1.0.0' },
    { supportedProtocolVersions: ['2026-07-28', ...SUPPORTED_PROTOCOL_VERSIONS] },
  );
  for (const operation of operations) {
    if (operation.access === 'public' || !allowed.has(operation.id)) continue;
    server.registerTool(
      operation.tool,
      {
        description: `${operation.id}: ${operation.method} ${operation.path}`,
        inputSchema: compileInputSchema(toolSchema(operation)),
        annotations: {
          readOnlyHint: operation.method === 'GET',
          destructiveHint: operation.method === 'DELETE',
          idempotentHint: operation.method === 'GET' || operation.idempotency === 'required',
          openWorldHint: false,
        },
      },
      (args, context) =>
        invoke(client, operation, {
          args,
          signal: context.mcpReq.signal,
          maximum: config.fileLimitBytes,
        }),
    );
  }
  return server;
}
