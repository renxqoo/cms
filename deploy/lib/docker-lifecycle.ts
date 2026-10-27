import { lstat, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { atomicWrite, releaseLink, switchLink, withDeployLock } from './docker-files';
import { composeCommand, containerState, dockerPrerequisites } from './docker-command';
import {
  copyDockerPackage,
  dockerManifest,
  loadDockerImage,
  matchesDockerImage,
  verifyDockerPackage,
} from './docker-package';
import type { DockerContext } from './docker-types';
import type { WatchSnapshot } from './docker-watch-config';
import { enableDockerWatch, restoreDockerWatch, snapshotDockerWatch } from './docker-watch-config';

export function dockerRelease(context: DockerContext, name: string): Promise<string | null> {
  return releaseLink({ root: context.paths.root }, name);
}

export function dockerLock<T>(context: DockerContext, action: () => Promise<T>): Promise<T> {
  return withDeployLock({ lock: context.paths.lock }, action);
}

export async function initDocker(context: DockerContext, source: string): Promise<void> {
  for (const directory of [
    context.paths.root,
    join(context.paths.root, 'releases'),
    context.paths.config,
    dirname(context.paths.state),
  ]) {
    await mkdir(directory, { recursive: true, mode: 0o755 });
    const info = await lstat(directory);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      info.uid !== process.getuid?.() ||
      (info.mode & 0o022) !== 0
    )
      throw new Error(
        'Docker deployment directories must be real directories without public write access',
      );
  }
  if (!(await lstat(context.paths.env).catch(() => null))) {
    const template = await readFile(join(source, 'deploy/production.env.example'), 'utf8');
    await atomicWrite(context.paths.env, template, 0o600);
  }
}

export async function waitDocker(context: DockerContext, directory: string): Promise<void> {
  const config = await context.config();
  const manifest = await dockerManifest(directory);
  const deadline = context.now() + 60_000;
  for (let attempt = 0; attempt < 60 && context.now() < deadline; attempt++) {
    try {
      const state = await containerState(directory, context.run);
      if (
        !state?.running ||
        state.health !== 'healthy' ||
        !matchesDockerImage(manifest, state.imageId)
      )
        throw new Error('Client container is not healthy');
      if ((await context.run(['docker', 'exec', state.id, 'node', '--version'])) !== 'v24.22.1')
        throw new Error('Client container requires Node.js 24.22.1');
      await context.health(config);
      return;
    } catch {
      await context.delay(1000);
    }
  }
  throw new Error('Client did not pass container, loopback and HTTPS health checks');
}

async function ensureProject(context: DockerContext, current: string | null): Promise<void> {
  const containers = await context.run([
    'docker',
    'ps',
    '--all',
    '--quiet',
    '--filter',
    'label=com.docker.compose.project=new-cms',
  ]);
  if (!current && containers) throw new Error('An unmanaged new-cms Docker project already exists');
  if (current) {
    const manifest = await dockerManifest(current);
    const state = await containerState(current, context.run);
    if (state && !matchesDockerImage(manifest, state.imageId))
      throw new Error('Managed Client container does not match the current release');
  }
}

export async function startDocker(context: DockerContext, directory: string): Promise<void> {
  await context.run(composeCommand(directory, ['config', '--quiet']));
  await context.run(
    composeCommand(directory, ['up', '--detach', '--no-build', '--pull', 'never', 'cms']),
  );
  await waitDocker(context, directory);
}

async function restoreDocker(
  context: DockerContext,
  current: string | null,
  failed: string,
): Promise<void> {
  if (current) await startDocker(context, current);
  else {
    await context.run(composeCommand(failed, ['down', '--timeout', '45']));
    await switchLink(join(context.paths.root, 'current'), null);
  }
}

interface PreviousDocker {
  current: string | null;
  previous: string | null;
  watch: WatchSnapshot | null;
}

async function recoverDocker(
  context: DockerContext,
  before: PreviousDocker,
  failed: string,
): Promise<void> {
  const actions = [
    () => restoreDocker(context, before.current, failed),
    () => switchLink(join(context.paths.root, 'current'), before.current),
    () => switchLink(join(context.paths.root, 'previous'), before.previous),
  ];
  const errors: unknown[] = [];
  for (const action of actions) {
    try {
      await action();
    } catch (error) {
      errors.push(error);
    }
  }
  if (before.watch) {
    try {
      await restoreDockerWatch(context, before.watch);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, 'Docker recovery failed');
}

export async function activateDocker(context: DockerContext, directory: string): Promise<void> {
  const current = await dockerRelease(context, 'current');
  const previous = await dockerRelease(context, 'previous');
  const watch = await snapshotDockerWatch(context);
  let watchChanged = false;
  try {
    await startDocker(context, directory);
    await switchLink(join(context.paths.root, 'previous'), current);
    await switchLink(join(context.paths.root, 'current'), directory);
    watchChanged = true;
    await enableDockerWatch(context, directory);
  } catch {
    try {
      await recoverDocker(
        context,
        { current, previous, watch: watchChanged ? watch : null },
        directory,
      );
    } catch {
      throw new Error(
        'Docker deployment failed and recovery failed; inspect the Client project locally',
      );
    }
    throw new Error('Docker deployment failed; the prior deployment state was restored');
  }
}

export async function installDocker(context: DockerContext, source: string): Promise<void> {
  const manifest = await verifyDockerPackage(source);
  await context.config();
  await dockerPrerequisites(context);
  await dockerLock(context, async () => {
    const current = await dockerRelease(context, 'current');
    await ensureProject(context, current);
    const directory = join(context.paths.root, 'releases', manifest.id);
    await copyDockerPackage(source, directory);
    await loadDockerImage(context, directory);
    await activateDocker(context, directory);
  });
}

export async function rollbackDocker(context: DockerContext): Promise<void> {
  await context.config();
  await dockerPrerequisites(context);
  await dockerLock(context, async () => {
    const previous = await dockerRelease(context, 'previous');
    if (!previous) throw new Error('No previous Docker release exists');
    await ensureProject(context, await dockerRelease(context, 'current'));
    await loadDockerImage(context, previous);
    await activateDocker(context, previous);
  });
}

export async function checkDocker(context: DockerContext): Promise<void> {
  await context.config();
  await dockerPrerequisites(context);
  const current = await dockerRelease(context, 'current');
  if (!current) throw new Error('No managed Docker release is active');
  await verifyDockerPackage(current, true);
  await waitDocker(context, current);
}
