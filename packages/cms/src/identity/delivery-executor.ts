import type { CmsPolicy } from '@new-cms/cms/platform/contracts';
import type { Database } from '@new-cms/database/client';
import type { Mailer, MailMessage } from './types.ts';
import { finishDelivery, startDelivery } from './adapters/postgres/deliveries.ts';
import type { FailureCode } from './adapters/postgres/deliveries.ts';

interface DeliveryTask {
  id: string;
  to: string;
  purpose: MailMessage['purpose'];
  token: string;
}

interface ExecutorDependencies {
  database: Database;
  policy: CmsPolicy;
  mailer: Mailer;
}

async function writeFailure(
  deps: ExecutorDependencies,
  id: string,
  options: { code: FailureCode; deadline: number },
): Promise<void> {
  const remaining = options.deadline - Date.now();
  if (remaining <= 0) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remaining);
  try {
    await deps.database.transaction(
      (tx) =>
        finishDelivery(tx, {
          id,
          status:
            options.code === 'capacity' || options.code === 'transport_rejected'
              ? 'failed'
              : 'unknown',
          failureCode: options.code,
        }),
      controller.signal,
    );
  } catch {
    return;
  } finally {
    clearTimeout(timer);
  }
}

async function runTask(
  deps: ExecutorDependencies,
  task: DeliveryTask,
  window: { signal: AbortSignal; deadline: number },
): Promise<void> {
  const { signal, deadline } = window;
  try {
    if (!(await deps.database.transaction((tx) => startDelivery(tx, task.id), signal))) return;
    signal.throwIfAborted();
    const outcome = await deps.mailer.send({ ...task, signal });
    task.token = '';
    if (signal.aborted)
      return await writeFailure(deps, task.id, { code: 'transport_timeout', deadline });
    if (outcome !== 'accepted')
      return await writeFailure(deps, task.id, {
        code: outcome === 'rejected' ? 'transport_rejected' : 'transport_unknown',
        deadline,
      });
    await deps.database.transaction(
      (tx) => finishDelivery(tx, { id: task.id, status: 'accepted' }),
      signal,
    );
  } catch {
    task.token = '';
    await writeFailure(deps, task.id, {
      code: signal.aborted ? 'transport_timeout' : 'state_unconfirmed',
      deadline,
    });
  }
}

export function createDeliveryExecutor(deps: ExecutorDependencies) {
  const active = new Map<Promise<void>, AbortController>();
  const observations = new Set<Promise<void>>();
  let closed = false;
  function dispatch(task: DeliveryTask): void {
    if (closed) {
      task.token = '';
      return;
    }
    if (active.size >= deps.policy.mailConcurrency) {
      task.token = '';
      if (observations.size >= deps.policy.mailConcurrency) return;
      const failure = writeFailure(deps, task.id, {
        code: 'capacity',
        deadline: Date.now() + deps.policy.mailTaskTimeoutMs,
      });
      observations.add(failure);
      void failure.finally(() => observations.delete(failure));
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.policy.mailTaskTimeoutMs);
    const promise = runTask(deps, task, {
      signal: controller.signal,
      deadline: Date.now() + deps.policy.mailTaskTimeoutMs,
    }).finally(() => {
      clearTimeout(timer);
      active.delete(promise);
    });
    active.set(promise, controller);
  }
  async function close(): Promise<void> {
    closed = true;
    for (const controller of active.values()) controller.abort();
    await Promise.all(active.keys());
    await Promise.all(observations);
  }
  return { dispatch, close };
}

export type DeliveryExecutor = ReturnType<typeof createDeliveryExecutor>;
