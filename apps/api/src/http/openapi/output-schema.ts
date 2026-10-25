import { z } from 'zod';
import type { Schema } from './schema.ts';

export function outputSchema(name: string, schema: z.ZodType): Schema {
  const value = z.toJSONSchema(schema, { io: 'output' });
  const serialized = JSON.stringify(value, (key, item: unknown) =>
    key === '$ref' && typeof item === 'string' && item.startsWith('#')
      ? `#/components/schemas/${name}${item.slice(1)}`
      : item,
  );
  return z.record(z.string(), z.unknown()).parse(JSON.parse(serialized));
}
