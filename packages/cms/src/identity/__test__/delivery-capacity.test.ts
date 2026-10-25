import { expect, it, vi } from 'vitest';
import type { Database, SqlExecutor } from '@new-cms/database/client';
import { createDeliveryExecutor } from '../delivery-executor.ts';
import { fixture } from './support.ts';

async function pending(w: Awaited<ReturnType<typeof fixture>>, email: string) {
  return w.database.transaction(async (tx) => {
    const account = await w.identity.participants.createAccount(tx, {
      email,
      displayName: null,
      roleId: w.admin.roleId,
    });
    return w.identity.participants.issueInvitation(tx, account.id, w.context);
  });
}

it('regression: capacity rejection cannot accumulate unbounded blocked observation work', async () => {
  const w = await fixture({ policy: { mailConcurrency: 1 } });
  const gate: { unlock?: () => void } = {};
  const waiting = new Promise<void>((resolve) => {
    gate.unlock = resolve;
  });
  let paused = false;
  let held = 0;
  let highWater = 0;
  let mailCalls = 0;
  const database: Database = {
    ...w.database,
    async transaction<T>(work: (tx: SqlExecutor) => Promise<T>, signal?: AbortSignal): Promise<T> {
      if (paused) {
        held += 1;
        highWater = Math.max(highWater, held);
        await waiting;
        held -= 1;
      }
      return w.database.transaction(work, signal);
    },
  };
  const executor = createDeliveryExecutor({
    database,
    policy: w.policy,
    mailer: {
      send: (message) => {
        mailCalls += 1;
        return new Promise((resolve) => {
          message.signal.addEventListener('abort', () => resolve('unknown'), { once: true });
        });
      },
      close: () => Promise.resolve(),
    },
  });
  try {
    const first = await pending(w, 'first@example.com');
    executor.dispatch({
      id: first.delivery.id,
      to: 'first@example.com',
      purpose: 'invitation',
      token: 'first-secret',
    });
    await vi.waitFor(() => expect(mailCalls).toBe(1));
    const overflow = await pending(w, 'overflow@example.com');
    paused = true;
    for (let index = 0; index < 20; index += 1)
      executor.dispatch({
        id: overflow.delivery.id,
        to: 'overflow@example.com',
        purpose: 'invitation',
        token: `secret-${index}`,
      });
    await Promise.resolve();
    expect(highWater).toBeLessThanOrEqual(w.policy.mailConcurrency);
    expect(mailCalls).toBe(1);
  } finally {
    gate.unlock?.();
    await executor.close();
    await w.close();
  }
});

it('regression: dispatch after close clears its secret without starting any database work', async () => {
  const w = await fixture();
  let transactions = 0;
  const database: Database = {
    ...w.database,
    transaction<T>(work: (tx: SqlExecutor) => Promise<T>, signal?: AbortSignal): Promise<T> {
      transactions += 1;
      return w.database.transaction(work, signal);
    },
  };
  const executor = createDeliveryExecutor({
    database,
    policy: w.policy,
    mailer: { send: () => Promise.resolve('accepted'), close: () => Promise.resolve() },
  });
  try {
    const issue = await pending(w, 'closed@example.com');
    await executor.close();
    const task = {
      id: issue.delivery.id,
      to: 'closed@example.com',
      purpose: 'invitation' as const,
      token: 'discard-me',
    };
    executor.dispatch(task);
    await Promise.resolve();
    expect(task.token).toBe('');
    expect(transactions).toBe(0);
    expect((await w.identity.participants.delivery(w.database, issue.delivery.id))?.status).toBe(
      'pending',
    );
  } finally {
    await executor.close();
    await w.close();
  }
});
