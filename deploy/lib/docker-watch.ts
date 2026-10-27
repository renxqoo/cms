import { lstat, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { atomicWrite } from './docker-files';
import { skipBusyDeployLock } from './deploy-lock';
import { composeCommand, containerState } from './docker-command';
import { dockerManifest, matchesDockerImage } from './docker-package';
import { dockerRelease, waitDocker } from './docker-lifecycle';
import type { DockerContext } from './docker-types';

async function lastRecovery(context: DockerContext): Promise<number> {
  const info = await lstat(context.paths.state).catch(() => null);
  if (!info) return 0;
  if (!info.isFile() || (info.mode & 0o077) !== 0)
    throw new Error('Watch state must be a private regular file');
  const raw: unknown = JSON.parse(await readFile(context.paths.state, 'utf8'));
  if (
    typeof raw !== 'object' ||
    raw === null ||
    !('lastRestart' in raw) ||
    typeof raw.lastRestart !== 'number' ||
    !Number.isFinite(raw.lastRestart) ||
    raw.lastRestart < 0
  )
    throw new Error('Invalid Docker watch recovery state');
  return raw.lastRestart;
}

export async function watchDocker(context: DockerContext): Promise<void> {
  await skipBusyDeployLock(context.paths, async () => {
    const current = await dockerRelease(context, 'current');
    if (!current) return;
    const state = await containerState(current, context.run);
    if (!state?.running || state.health !== 'unhealthy') return;
    if (!matchesDockerImage(await dockerManifest(current), state.imageId))
      throw new Error('Client container does not match its managed release');
    const now = context.now();
    if (now - (await lastRecovery(context)) < 300_000) return;
    await mkdir(dirname(context.paths.state), { recursive: true, mode: 0o755 });
    await atomicWrite(context.paths.state, `${JSON.stringify({ lastRestart: now })}\n`, 0o600);
    await context.run(composeCommand(current, ['restart', '--timeout', '45', 'cms']));
    await waitDocker(context, current);
  });
}

export async function statusDocker(context: DockerContext): Promise<string> {
  const current = await dockerRelease(context, 'current');
  if (!current) return 'Client Docker: not installed';
  const state = await containerState(current, context.run);
  if (!state) return 'Client Docker: container missing';
  const running = state.running ? 'running' : 'stopped';
  return `Client Docker: ${running}; health=${state.health}; release=${current.split('/').at(-1)}`;
}
