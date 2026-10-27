import { chmod, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { HostPaths, RunCommand } from './system';

async function systemUser(paths: HostPaths, run: RunCommand): Promise<void> {
  const existing = await run(['getent', 'passwd', 'new-cms']).catch(() => '');
  if (existing) {
    const fields = existing.split(':');
    if (fields[2] === '0' || fields[5] !== paths.home || !fields[6]?.endsWith('/nologin'))
      throw new Error('Existing new-cms user must be a dedicated non-root nologin account');
    return;
  }
  await run([
    'useradd',
    '--system',
    '--user-group',
    '--home-dir',
    paths.home,
    '--shell',
    '/usr/sbin/nologin',
    'new-cms',
  ]);
}

async function protectedDirectory(path: string, mode: number): Promise<void> {
  await mkdir(path, { recursive: true, mode });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== 0)
    throw new Error(`${path} must be a root-owned regular directory`);
  await chmod(path, mode);
}

export async function initializeHost(
  source: string,
  paths: HostPaths,
  run: RunCommand,
): Promise<void> {
  await systemUser(paths, run);
  for (const path of [paths.root, join(paths.root, 'releases'), paths.cache])
    await protectedDirectory(path, 0o755);
  for (const path of [paths.config, join(paths.config, 'tls')]) {
    await protectedDirectory(path, 0o750);
    await run(['chown', 'root:new-cms', path]);
  }
  for (const path of [paths.home, join(paths.home, '.pm2'), join(paths.home, 'logs')]) {
    await mkdir(path, { recursive: true, mode: 0o700 });
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error(`${path} must be a regular directory`);
    await run(['chown', 'new-cms:new-cms', path]);
    await chmod(path, 0o700);
  }
  const env = join(paths.config, 'cms.env');
  if (!(await lstat(env).catch(() => null))) {
    await writeFile(env, await readFile(join(source, 'deploy/production.env.example')), {
      mode: 0o640,
      flag: 'wx',
    });
    await run(['chown', 'root:new-cms', env]);
  }
}

export async function initializeEdge(paths: HostPaths, edge: string): Promise<void> {
  const path = join(paths.config, 'edge-mode');
  const existing = await readFile(path, 'utf8').catch(() => null);
  if (existing !== null && existing.trim() !== edge)
    throw new Error(
      'Existing edge mode differs; migrate the edge configuration explicitly before changing it',
    );
  if (existing === null) await writeFile(path, `${edge}\n`, { mode: 0o644, flag: 'wx' });
}
