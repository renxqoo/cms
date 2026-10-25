import { fail } from '@new-cms/cms/platform/contracts';
import type { ContentLimits } from '../definition.ts';
import { objectValue } from '../fields/json-value.ts';
import { assertJsonBudget } from '../fields/data-budget.ts';
export function assertRawQueryBudget(input: unknown, limits: ContentLimits): void {
  if (!objectValue(input)) return;
  for (const key of ['select', 'sort'])
    if (Array.isArray(input[key]) && input[key].length > limits.maxFields) fail('invalid_input');
  for (const key of ['where', 'policy'])
    if (input[key] !== undefined) checkWhere(input[key], limits);
}
function checkWhere(value: unknown, limits: ContentLimits): void {
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 1 }];
  let count = 0;
  while (pending.length > 0) {
    const entry = pending.pop();
    if (!entry) break;
    count += 1;
    if (count > limits.maxQueryNodes || entry.depth > limits.maxQueryDepth) fail('invalid_input');
    if (!objectValue(entry.value)) continue;
    for (const key of ['and', 'or']) {
      const nodes = entry.value[key];
      if (Array.isArray(nodes))
        for (const child of nodes) pending.push({ value: child, depth: entry.depth + 1 });
    }
    if (Object.hasOwn(entry.value, 'value'))
      assertJsonBudget(entry.value['value'], {
        maxDepth: limits.maxFieldDepth,
        maxBytes: limits.maxDataBytes,
        maxNodes: limits.maxArrayItems * limits.maxFieldDepth,
        maxArrayLength: limits.maxArrayItems,
      });
  }
}
