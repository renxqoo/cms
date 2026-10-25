import { describe, expect, it } from 'vitest';
import { createTestPolicy } from '../../../../../../test/support/policy.ts';
import { createScryptPasswords } from '../scrypt.ts';
import { createPasswordExecutor } from '../executor.ts';

const settings = { N: 32768, r: 8, p: 3, saltBytes: 16, keyBytes: 64, maxmemBytes: 67_108_864 };

function deferred<T>() {
  const state: { resolve?: (value: T) => void } = {};
  const promise = new Promise<T>((done) => {
    state.resolve = done;
  });
  return {
    promise,
    resolve: (value: T) => {
      if (!state.resolve) throw new Error('Resolver was not initialized');
      state.resolve(value);
    },
  };
}

describe('production scrypt passwords', () => {
  it('uses fresh salts and verifies the encoded password without persisting cleartext', async () => {
    const passwords = createScryptPasswords({ policy: createTestPolicy(), settings });
    try {
      const first = await passwords.hash('strong password for CMS');
      const second = await passwords.hash('strong password for CMS');
      expect(first).not.toBe(second);
      expect(first).toMatch(/^scrypt\$32768\$8\$3\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/);
      expect(first).not.toContain('strong password for CMS');
      await expect(passwords.verify('strong password for CMS', first)).resolves.toBe(true);
      await expect(passwords.verify('wrong password', first)).resolves.toBe(false);
      await expect(passwords.verify('strong password for CMS ', first)).resolves.toBe(false);
    } finally {
      await passwords.close();
    }
  });

  it('rejects unknown or malformed hashes through the bounded dummy path', async () => {
    const passwords = createScryptPasswords({ policy: createTestPolicy(), settings });
    try {
      const values = [
        null,
        '',
        'scrypt',
        'x'.repeat(513),
        'scrypt$999999999$8$3$salt$key',
        'scrypt$32768$8$3$$key',
        'scrypt$32768$8$3$invalid!$key',
        'scrypt$32768$8$3$YQ$Yg',
        `scrypt$32768$8$3$${'a'.repeat(22)}$${'b'.repeat(86)}extra`,
      ];
      for (const value of values)
        await expect(passwords.verify('some password', value)).resolves.toBe(false);
    } finally {
      await passwords.close();
    }
  });

  it('refuses an unsafe calculation profile and does not start work after cancellation or close', async () => {
    expect(() =>
      createScryptPasswords({ policy: createTestPolicy(), settings: { ...settings, N: 1024 } }),
    ).toThrowError('invalid input');
    const passwords = createScryptPasswords({ policy: createTestPolicy(), settings });
    const controller = new AbortController();
    controller.abort();
    await expect(passwords.hash('a password', controller.signal)).rejects.toMatchObject({
      code: 'temporarily_unavailable',
    });
    await passwords.close();
    await passwords.close();
    await expect(passwords.hash('a password')).rejects.toMatchObject({
      code: 'temporarily_unavailable',
    });
  });
});

describe('password work capacity', () => {
  it('regression: cancelling the caller retains the active slot until the real calculation completes', async () => {
    const executor = createPasswordExecutor(
      createTestPolicy({ passwordConcurrency: 1, passwordQueueLimit: 1 }),
    );
    const firstWork = deferred<number>();
    const controller = new AbortController();
    const first = executor.run(() => firstWork.promise, controller.signal);
    await Promise.resolve();
    controller.abort();
    await expect(first).rejects.toMatchObject({ code: 'temporarily_unavailable' });
    let secondStarted = false;
    const second = executor.run(() => {
      secondStarted = true;
      return Promise.resolve(2);
    });
    await expect(executor.run(() => Promise.resolve(3))).rejects.toMatchObject({
      code: 'temporarily_unavailable',
    });
    expect(secondStarted).toBe(false);
    firstWork.resolve(1);
    await expect(second).resolves.toBe(2);
    await executor.close();
  });

  it('bounds queue waiting and releases queued work on cancellation and shutdown', async () => {
    const executor = createPasswordExecutor(
      createTestPolicy({
        passwordConcurrency: 1,
        passwordQueueLimit: 2,
        passwordQueueTimeoutMs: 10,
      }),
    );
    const work = deferred<number>();
    const running = executor.run(() => work.promise);
    const controller = new AbortController();
    const cancelled = executor.run(() => Promise.resolve(2), controller.signal);
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ code: 'temporarily_unavailable' });
    await expect(executor.run(() => Promise.resolve(3))).rejects.toMatchObject({
      code: 'temporarily_unavailable',
    });
    const shutdown = executor.run(() => Promise.resolve(4));
    const closing = executor.close();
    await expect(shutdown).rejects.toMatchObject({ code: 'temporarily_unavailable' });
    work.resolve(1);
    await running;
    await closing;
  });

  it('keeps timeout independent from calculation completion and recovers capacity after rejection', async () => {
    const executor = createPasswordExecutor(
      createTestPolicy({ passwordConcurrency: 1, passwordTimeoutMs: 10 }),
    );
    const work = deferred<number>();
    await expect(executor.run(() => work.promise)).rejects.toMatchObject({
      code: 'temporarily_unavailable',
    });
    work.resolve(1);
    await expect(
      executor.run(() => Promise.reject(new Error('calculation failed'))),
    ).rejects.toThrow('calculation failed');
    await expect(executor.run(() => Promise.resolve(7))).resolves.toBe(7);
    await executor.close();
  });
});
