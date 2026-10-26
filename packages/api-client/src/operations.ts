import { z } from 'zod';
import rows from './operations.generated.json' with { type: 'json' };

export interface ApiOperation {
  id: string;
  module: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  access: string;
  scopeKind: string;
  idempotency?: string | undefined;
  command: string;
  tool: string;
  transport: 'json' | 'upload' | 'download';
  inputSchema: Record<string, unknown>;
}

export const operations: readonly ApiOperation[] = z
  .array(
    z.object({
      id: z.string(),
      module: z.string(),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
      path: z.string(),
      access: z.string(),
      scopeKind: z.string(),
      idempotency: z.string().optional(),
      command: z.string(),
      tool: z.string(),
      transport: z.enum(['json', 'upload', 'download']),
      inputSchema: z.record(z.string(), z.unknown()),
    }),
  )
  .parse(rows);
const byId = new Map(operations.map((operation) => [operation.id, operation]));
const schemas = new Map(
  operations.map((operation) => [operation.id, z.fromJSONSchema(operation.inputSchema)]),
);

export function operationFor(id: string): ApiOperation {
  const operation = byId.get(id);
  if (!operation) throw new Error(`Unknown operation: ${id}`);
  return operation;
}

export function validateInput(id: string, input: unknown): Record<string, unknown> {
  operationFor(id);
  const schema = schemas.get(id);
  if (!schema) throw new Error(`Missing input schema: ${id}`);
  return z.record(z.string(), z.unknown()).parse(schema.parse(input));
}
