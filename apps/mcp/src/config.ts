import { z } from 'zod';
import { apiOrigin } from '@new-cms/api-client/client';

const integer = z.coerce.number().int().positive();
const schema = z.object({
  CMS_API_ORIGIN: z.string(),
  CMS_MCP_RESOURCE: z.url(),
  CMS_MCP_BRIDGE_SECRET: z.string().min(32),
  MCP_HOST: z.string().default('127.0.0.1'),
  MCP_PORT: z.coerce.number().int().min(0).max(65535).default(3002),
  MCP_ALLOWED_ORIGINS: z.string().default(''),
  MCP_ALLOWED_HOSTS: z.string().default('localhost,127.0.0.1,[::1]'),
  MCP_BODY_LIMIT_BYTES: integer.default(33_554_432),
  MCP_FILE_LIMIT_BYTES: integer.default(20_971_520),
  MCP_RESPONSE_LIMIT_BYTES: integer.default(33_554_432),
  MCP_IN_FLIGHT_BYTES: integer.default(134_217_728),
  MCP_CONCURRENCY: integer.default(32),
  MCP_REQUEST_TIMEOUT_MS: integer.default(60_000),
  MCP_SHUTDOWN_TIMEOUT_MS: integer.default(10_000),
  MCP_OPERATION_PAGE_LIMIT: integer.default(100),
});

export function loadMcpConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.parse(env);
  const resource = new URL(parsed.CMS_MCP_RESOURCE);
  apiOrigin(resource.origin);
  if (
    resource.username ||
    resource.password ||
    resource.search ||
    resource.hash ||
    resource.pathname !== '/mcp'
  )
    throw new Error('MCP resource must be the public /mcp URI');
  return {
    protocolResponseLimitBytes: 65_536,
    headerLimitBytes: 16_384,
    operationPageSize: 100,
    apiOrigin: apiOrigin(parsed.CMS_API_ORIGIN),
    resource: resource.href,
    bridgeSecret: parsed.CMS_MCP_BRIDGE_SECRET,
    host: parsed.MCP_HOST,
    port: parsed.MCP_PORT,
    allowedOrigins: parsed.MCP_ALLOWED_ORIGINS.split(',').filter(Boolean),
    allowedHosts: parsed.MCP_ALLOWED_HOSTS.split(',').filter(Boolean),
    bodyLimitBytes: parsed.MCP_BODY_LIMIT_BYTES,
    fileLimitBytes: parsed.MCP_FILE_LIMIT_BYTES,
    responseLimitBytes: parsed.MCP_RESPONSE_LIMIT_BYTES,
    inFlightBytes: parsed.MCP_IN_FLIGHT_BYTES,
    concurrency: parsed.MCP_CONCURRENCY,
    requestTimeoutMs: parsed.MCP_REQUEST_TIMEOUT_MS,
    shutdownTimeoutMs: parsed.MCP_SHUTDOWN_TIMEOUT_MS,
    operationPageLimit: parsed.MCP_OPERATION_PAGE_LIMIT,
  };
}
export type McpConfig = ReturnType<typeof loadMcpConfig>;
