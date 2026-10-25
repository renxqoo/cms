import { z } from 'zod';
import type { ContentApi } from '@new-cms/cms/content';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import type { Schema } from '../http/openapi/schema.ts';

export async function contentOpenApiSchemas(
  api: ContentApi,
  context: RequestContext,
): Promise<Record<string, Schema>> {
  const result = z
    .object({
      rows: z.array(z.object({ key: z.string(), dataSchema: z.record(z.string(), z.unknown()) })),
    })
    .parse(await api.listCollections(context, {}));
  const schemas: Record<string, Schema> = {};
  const alternatives: Schema[] = [];
  for (const row of result.rows) {
    const { key, dataSchema } = row;
    if (
      typeof key !== 'string' ||
      dataSchema === null ||
      typeof dataSchema !== 'object' ||
      Array.isArray(dataSchema)
    )
      throw new Error('Invalid collection schema metadata');
    const name = `CollectionData_${key}`;
    schemas[name] = dataSchema;
    alternatives.push({ $ref: `#/components/schemas/${name}` });
  }
  schemas['ContentData'] = alternatives.length > 0 ? { anyOf: alternatives } : { not: {} };
  return schemas;
}
