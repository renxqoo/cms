import { CmsError, fail } from '@new-cms/cms/platform/contracts';
import type { Principal } from '@new-cms/cms/access';
import type { ContentLimits } from '../definition.ts';

export interface FunctionScope {
  budget: { used: number };
  signal?: AbortSignal;
  actor?: Readonly<Principal>;
  operation?: string;
}

export function immutable<T>(value: T): T {
  const copy = structuredClone(value);
  const pending: unknown[] = [copy];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === null || typeof current !== 'object') continue;
    Object.freeze(current);
    const children: unknown[] = Object.values(current);
    pending.push(...children);
  }
  return copy;
}

export async function invokeFunction<T>(input: {
  scope: FunctionScope;
  limits: ContentLimits;
  run(signal: AbortSignal): T | Promise<T>;
}): Promise<T> {
  input.scope.budget.used += 1;
  if (input.scope.budget.used > input.limits.maxHookCalls) fail('capacity_exceeded');
  const controller = new AbortController();
  const signal = input.scope.signal
    ? AbortSignal.any([input.scope.signal, controller.signal])
    : controller.signal;
  const timeout = setTimeout(() => controller.abort(), input.limits.maxHookDurationMs);
  let abortListener: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    abortListener = () => reject(new CmsError('temporarily_unavailable'));
    signal.addEventListener('abort', abortListener, { once: true });
  });
  try {
    if (signal.aborted) fail('temporarily_unavailable');
    const task = Promise.resolve()
      .then(() => input.run(signal))
      .catch(() => fail('invalid_input'));
    const value = await Promise.race([task, aborted]);
    if (signal.aborted) fail('temporarily_unavailable');
    return value;
  } finally {
    clearTimeout(timeout);
    if (abortListener) signal.removeEventListener('abort', abortListener);
  }
}
