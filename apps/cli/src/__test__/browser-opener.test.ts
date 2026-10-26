import { afterAll, beforeAll, afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type * as ChildProcessModule from 'node:child_process';
import { cliConfig } from '../config.ts';
import { login } from '../oauth.ts';

const launcher = vi.hoisted(() => ({
  executable: '',
  children: [] as ChildProcessModule.ChildProcess[],
}));
vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof ChildProcessModule>();
  return {
    ...actual,
    spawn: (
      _command: string,
      args: readonly string[],
      options: ChildProcessModule.SpawnOptions,
    ) => {
      const child = actual.spawn(launcher.executable, args, options);
      launcher.children.push(child);
      return child;
    },
  };
});

let launcherRoot: string;
beforeAll(async () => {
  launcherRoot = await mkdtemp(join(tmpdir(), 'cms-browser-launch-'));
  launcher.executable = join(launcherRoot, 'browser-launcher');
  await writeFile(
    launcher.executable,
    `#!/bin/sh
exec /bin/sleep 3
`,
    { mode: 0o755 },
  );
});
afterAll(() => rm(launcherRoot, { recursive: true, force: true }));
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(launcher.children.splice(0).map(reap));
});

it.each(['timeout', 'cancel'] as const)(
  'regression: a hanging browser launcher cannot delay login %s or retain its process',
  async (kind) => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const config = cliConfig({
      CMS_API_ORIGIN: 'https://api.example',
      CMS_CLI_STATE_DIR: launcherRoot,
      CMS_CLI_LOGIN_TIMEOUT_MS: kind === 'timeout' ? '100' : '10000',
    });
    const controller = new AbortController();
    const outcome = login(config, { signal: controller.signal, browser: true }).catch(
      (error: unknown) => error,
    );
    try {
      await vi.waitFor(() => expect(launcher.children).toHaveLength(1), {
        timeout: 1000,
        interval: 5,
      });
      const pid = launcher.children[0]?.pid;
      expect(pid).toBeGreaterThan(0);
      if (!pid) throw new Error('Browser launcher has no PID');
      if (kind === 'cancel') controller.abort();
      expect(await outcome).toMatchObject({
        message: kind === 'cancel' ? 'Authorization cancelled' : 'Authorization timed out',
      });
      await vi.waitFor(() => expect(processAlive(pid)).toBe(false), { timeout: 500, interval: 5 });
    } finally {
      controller.abort();
      await outcome;
    }
  },
  1500,
);

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function reap(child: ChildProcessModule.ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once('close', () => resolve());
    child.kill('SIGKILL');
  });
}
