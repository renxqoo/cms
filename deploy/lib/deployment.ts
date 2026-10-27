import { chmod, lstat, mkdir, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { renderNginx } from './config';
import type { ProductionConfig } from './config';
import {
  atomicWrite,
  assertPackageTree,
  copyPackage,
  readManifest,
  releaseLink,
  switchLink,
} from './files';
import { pm2Command } from './system';
import type { EdgeMode, HostPaths, RunCommand } from './system';

interface Deployment {
  paths: HostPaths;
  config: ProductionConfig;
  run: RunCommand;
  healthy: () => Promise<void>;
  managerScript: string;
  edge: EdgeMode;
  verifyManager: () => Promise<void>;
}

interface Snapshot {
  current: string | null;
  previous: string | null;
  files: { path: string; content: string | null }[];
  unitActive: boolean;
  unitEnabled: boolean;
}

async function snapshot(deployment: Deployment): Promise<Snapshot> {
  const { paths, edge } = deployment;
  const managed = [paths.ecosystem, paths.unit, paths.resources, paths.logrotate];
  if (edge === 'nginx') managed.push(paths.nginx);
  const files = await Promise.all(
    managed.map(async (path) => ({
      path,
      content: await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      }),
    })),
  );
  return {
    current: await releaseLink(paths, 'current'),
    previous: await releaseLink(paths, 'previous'),
    files,
    unitActive: await deployment.run(['systemctl', 'is-active', '--quiet', 'pm2-new-cms']).then(
      () => true,
      () => false,
    ),
    unitEnabled: await deployment.run(['systemctl', 'is-enabled', '--quiet', 'pm2-new-cms']).then(
      () => true,
      () => false,
    ),
  };
}

async function templates(release: string, deployment: Deployment): Promise<void> {
  const { paths, config } = deployment;
  const source = join(release, 'deploy');
  const ecosystem = (await readFile(join(source, 'ecosystem.config.cjs'), 'utf8')).replaceAll(
    '__PORT__',
    String(config.port),
  );
  if (deployment.edge === 'nginx')
    await atomicWrite(
      paths.nginx,
      renderNginx(await readFile(join(source, 'nginx-host.conf'), 'utf8'), config),
    );
  await atomicWrite(paths.ecosystem, ecosystem);
  await atomicWrite(
    paths.unit,
    (await readFile(join(source, 'pm2-new-cms.service'), 'utf8')).replaceAll(
      '__PM2_SCRIPT__',
      deployment.managerScript,
    ),
  );
  await mkdir(join(paths.resources, '..'), { recursive: true });
  await atomicWrite(paths.resources, await readFile(join(source, 'pm2-resources.conf'), 'utf8'));
  await atomicWrite(paths.logrotate, await readFile(join(source, 'logrotate.conf'), 'utf8'));
}

async function launch(deployment: Deployment): Promise<void> {
  const { paths, run } = deployment;
  await run(
    pm2Command(paths, ['startOrRestart', paths.ecosystem, '--only', 'new-cms', '--update-env']),
  );
  if (deployment.edge === 'nginx') await run(['systemctl', 'reload', 'nginx']);
  await deployment.healthy();
  await run(pm2Command(paths, ['save', '--force']));
  const active = await run(['systemctl', 'is-active', '--quiet', 'pm2-new-cms']).then(
    () => true,
    () => false,
  );
  if (!active) {
    await run(pm2Command(paths, ['kill']));
    await run(['systemctl', 'enable', '--now', 'pm2-new-cms']);
    await deployment.healthy();
  }
  await deployment.verifyManager();
}

async function cleanInitialProcess(deployment: Deployment): Promise<void> {
  const { paths, run } = deployment;
  await run(['systemctl', 'stop', 'pm2-new-cms']).catch(() => '');
  await run(['systemctl', 'disable', 'pm2-new-cms']).catch(() => '');
  await run(pm2Command(paths, ['kill'])).catch(() => '');
  for (const name of ['dump.pm2', 'dump.pm2.bak'])
    await rm(join(paths.home, '.pm2', name), { force: true });
  const active = await run(['systemctl', 'is-active', '--quiet', 'pm2-new-cms']).then(
    () => true,
    () => false,
  );
  if (active || (await lstat(join(paths.home, '.pm2/pm2.pid')).catch(() => null)))
    throw new Error('Failed to stop the initial PM2 daemon');
}

async function restore(before: Snapshot, deployment: Deployment): Promise<void> {
  const { paths, run } = deployment;
  if (!before.current) await cleanInitialProcess(deployment);
  for (const file of before.files) {
    if (file.content === null) await rm(file.path, { force: true });
    else await atomicWrite(file.path, file.content);
  }
  await switchLink(join(paths.root, 'current'), before.current);
  await switchLink(join(paths.root, 'previous'), before.previous);
  await run(['systemctl', 'daemon-reload']);
  if (deployment.edge === 'nginx') await run(['nginx', '-t']);
  if (before.current) await launch(deployment);
  else if (deployment.edge === 'nginx') await run(['systemctl', 'reload', 'nginx']);
  if (!before.unitEnabled) await run(['systemctl', 'disable', 'pm2-new-cms']).catch(() => '');
  if (!before.unitActive) await run(['systemctl', 'stop', 'pm2-new-cms']).catch(() => '');
}

async function activate(
  release: string,
  deployment: Deployment,
  rememberPrevious = true,
): Promise<void> {
  const { paths, run } = deployment;
  const before = await snapshot(deployment);
  try {
    await templates(release, deployment);
    if (deployment.edge === 'nginx') await run(['nginx', '-t']);
    await run(['logrotate', '--debug', paths.logrotate]);
    await run(['systemctl', 'daemon-reload']);
    await switchLink(join(paths.root, 'current'), release);
    await launch(deployment);
    if (rememberPrevious) await switchLink(join(paths.root, 'previous'), before.current);
  } catch (error) {
    try {
      await restore(before, deployment);
    } catch {
      throw new Error(
        'Release failed and recovery is unhealthy; inspect PM2/Nginx logs and current/previous links',
      );
    }
    throw new Error('Release failed; the previous deployment was restored', { cause: error });
  }
}

async function assertFreePort(port: number): Promise<void> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
}

async function prepareCache(release: string, deployment: Deployment): Promise<void> {
  const { paths, run } = deployment;
  const { id } = await readManifest(release);
  const cache = join(paths.cache, id);
  await mkdir(cache, { mode: 0o750 });
  await run(['chown', 'new-cms:new-cms', cache]);
  await symlink(cache, join(release, 'runtime/.next/cache'));
}

export async function installRelease(source: string, deployment: Deployment): Promise<void> {
  const { paths, config, run } = deployment;
  const { id } = await readManifest(source);
  await assertPackageTree(source);
  await readFile(join(source, 'runtime/server.js'));
  if (!(await releaseLink(paths, 'current'))) {
    if (
      (await lstat(paths.unit).catch(() => null)) ||
      (await lstat(join(paths.home, '.pm2/pm2.pid')).catch(() => null))
    )
      throw new Error('Existing PM2 state has no managed current release; migrate it explicitly');
    await assertFreePort(config.port);
  }
  const release = join(paths.root, 'releases', id);
  if (await lstat(release).catch(() => null))
    throw new Error('Release already exists; use a new release ID');
  await copyPackage(source, release);
  await run(['chown', '-R', 'root:root', release]);
  await run(['chmod', '-R', 'u=rwX,go=rX', release]);
  await chmod(release, 0o755);
  await prepareCache(release, deployment);
  await activate(release, deployment);
}

export async function rollbackRelease(deployment: Deployment): Promise<void> {
  const previous = await releaseLink(deployment.paths, 'previous');
  if (!previous) throw new Error('No previous successful release is available');
  await readManifest(previous);
  await activate(previous, deployment);
}

export async function restartRelease(deployment: Deployment): Promise<void> {
  const current = await releaseLink(deployment.paths, 'current');
  if (!current) throw new Error('No installed release is available to restart');
  await activate(current, deployment, false);
}
