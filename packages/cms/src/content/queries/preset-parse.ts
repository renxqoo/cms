import { assertJsonBudget } from '../fields/data-budget.ts';
import { parse } from '../runtime.ts';
import type { z } from 'zod';
import type { ContentRuntime } from '../types.ts';

export function parsePresetInput<T>(
  runtime: ContentRuntime,
  schema: z.ZodType<T>,
  raw: unknown,
): T {
  assertJsonBudget(raw, {
    maxDepth: runtime.limits.maxFieldDepth * 2 + runtime.limits.maxRichTextDepth * 2 + 5,
    maxBytes: runtime.limits.maxResponseBytes,
    maxNodes: runtime.limits.maxDataBytes,
  });
  return parse(schema, raw);
}
