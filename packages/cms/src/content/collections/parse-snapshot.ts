import { z } from 'zod';
import { parsePhysicalPlan } from '@new-cms/database/codegen';
import { fail } from '@new-cms/cms/platform/contracts';
import type { ContentSchemaSnapshot } from '../model.ts';
const snapshotSchema = z.strictObject({
  plan: z.unknown(),
  collections: z.array(
    z.strictObject({
      id: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
      key: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
      schemaVersion: z
        .number()
        .int()
        .positive()
        .max(2 ** 31 - 1),
      dataFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    }),
  ),
});
export function parseContentSchemaSnapshot(value: unknown): ContentSchemaSnapshot {
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success) fail('invalid_input');
  const { collections, plan } = parsed.data;
  if (
    new Set(collections.map((collection) => collection.id)).size !== collections.length ||
    new Set(collections.map((collection) => collection.key)).size !== collections.length
  )
    fail('invalid_input');
  try {
    return { plan: parsePhysicalPlan(plan), collections };
  } catch {
    return fail('invalid_input');
  }
}
