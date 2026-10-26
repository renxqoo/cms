import { contentPolicy } from './content-policy';
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function rawWhereBudget(value: unknown) {
  if (value === undefined) return true;
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 1 }];
  let count = 0;
  while (pending.length > 0) {
    const item = pending.pop();
    if (!item) return false;
    count += 1;
    if (count > contentPolicy.maximumQueryNodes || item.depth > contentPolicy.maximumQueryDepth)
      return false;
    if (!object(item.value)) continue;
    for (const key of ['and', 'or']) {
      const nodes = item.value[key];
      if (Array.isArray(nodes))
        pending.push(...nodes.map((node: unknown) => ({ value: node, depth: item.depth + 1 })));
    }
    if (Object.hasOwn(item.value, 'value') && !queryValueBudget(item.value['value'])) return false;
  }
  return true;
}
function queryValueBudget(value: unknown) {
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 1 }];
  let nodes = 0;
  while (stack.length > 0) {
    const item = stack.pop();
    if (!item) return false;
    nodes += 1;
    if (
      nodes > contentPolicy.maximumQueryValueNodes ||
      item.depth > contentPolicy.maximumQueryValueDepth
    )
      return false;
    if (Array.isArray(item.value)) {
      if (item.value.length > contentPolicy.maximumQueryValueItems) return false;
      stack.push(...item.value.map((child: unknown) => ({ value: child, depth: item.depth + 1 })));
    } else if (object(item.value))
      stack.push(
        ...Object.values(item.value).map((child) => ({ value: child, depth: item.depth + 1 })),
      );
  }
  return true;
}
