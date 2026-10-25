import { fail } from '@new-cms/cms/platform/contracts';
import { objectValue } from './json-value.ts';
interface JsonBudget {
  maxDepth: number;
  maxBytes: number;
  maxNodes: number;
  maxArrayLength?: number;
}
interface Entry {
  value: unknown;
  depth: number;
  exit?: boolean;
}
function primitiveBytes(value: unknown): number {
  if (value === null) return 4;
  if (typeof value === 'string') return Buffer.byteLength(value) + 2;
  if (typeof value === 'boolean') return value ? 4 : 5;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value).length;
  return fail('invalid_input');
}
export function assertJsonBudget(value: unknown, limits: JsonBudget): void {
  const stack: Entry[] = [{ value, depth: 1 }];
  const parents = new WeakSet<object>();
  let bytes = 0;
  let nodes = 0;
  while (stack.length > 0) {
    const entry = stack.pop();
    if (!entry) break;
    if (entry.exit && entry.value !== null && typeof entry.value === 'object') {
      parents.delete(entry.value);
      continue;
    }
    nodes += 1;
    if (nodes > limits.maxNodes || entry.depth > limits.maxDepth) fail('payload_too_large');
    if (entry.value === null || typeof entry.value !== 'object')
      bytes += primitiveBytes(entry.value);
    else {
      if (parents.has(entry.value)) fail('invalid_input');
      parents.add(entry.value);
      stack.push({ ...entry, exit: true });
      bytes += pushChildren(stack, entry, limits);
    }
    if (bytes > limits.maxBytes || stack.length > limits.maxNodes * 2) fail('payload_too_large');
  }
  if (Buffer.byteLength(JSON.stringify(value)) > limits.maxBytes) fail('payload_too_large');
}
function pushChildren(stack: Entry[], entry: Entry, limits: JsonBudget): number {
  if (Array.isArray(entry.value)) {
    if (limits.maxArrayLength !== undefined && entry.value.length > limits.maxArrayLength)
      fail('payload_too_large');
    for (const child of entry.value) stack.push({ value: child, depth: entry.depth + 1 });
    return entry.value.length + 2;
  }
  if (!objectValue(entry.value)) fail('invalid_input');
  const entries = Object.entries(entry.value);
  let bytes = 2;
  for (const [key, value] of entries) {
    bytes += Buffer.byteLength(key) + 3;
    stack.push({ value, depth: entry.depth + 1 });
  }
  return bytes;
}
