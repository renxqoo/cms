import { chmod, chown, lstat, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWrite } from './docker-files';
import type { DockerContext } from './docker-types';

interface WatchFile {
  path: string;
  content: string | null;
  mode: number;
  uid: number;
  gid: number;
}

interface WatchUnit {
  name: string;
  enabled: boolean;
  active: boolean;
}

export interface WatchSnapshot {
  files: WatchFile[];
  units: WatchUnit[];
}

async function snapshotFile(path: string): Promise<WatchFile> {
  const info = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (info && (!info.isFile() || info.uid !== process.getuid?.() || (info.mode & 0o022) !== 0))
    throw new Error('Docker recovery units must be protected regular deployment files');
  return {
    path,
    content: info ? await readFile(path, 'utf8') : null,
    mode: info ? info.mode & 0o777 : 0o644,
    uid: info?.uid ?? 0,
    gid: info?.gid ?? 0,
  };
}

async function unitState(context: DockerContext, name: string): Promise<WatchUnit> {
  const output = await context.run([
    'systemctl',
    'show',
    '--all',
    '--no-pager',
    '--property=LoadState,ActiveState,UnitFileState',
    name,
  ]);
  const properties = new Map<string, string>();
  for (const line of output.trim().split('\n')) {
    const match = /^(LoadState|ActiveState|UnitFileState)=(.*)$/.exec(line);
    if (!match || properties.has(match[1])) throw new Error('Invalid Docker recovery unit state');
    properties.set(match[1], match[2]);
  }
  const load = properties.get('LoadState');
  const active = properties.get('ActiveState');
  const enabled = properties.get('UnitFileState');
  if (load === 'not-found' && active === 'inactive' && enabled === '')
    return { name, active: false, enabled: false };
  if (
    load !== 'loaded' ||
    !['active', 'inactive'].includes(active ?? '') ||
    !['enabled', 'disabled', 'static', 'indirect'].includes(enabled ?? '')
  )
    throw new Error('Docker recovery unit state cannot be safely restored');
  return { name, active: active === 'active', enabled: enabled === 'enabled' };
}

export async function snapshotDockerWatch(context: DockerContext): Promise<WatchSnapshot> {
  return {
    files: await Promise.all([context.paths.unit, context.paths.timer].map(snapshotFile)),
    units: await Promise.all(
      ['new-cms-docker-watch.timer', 'new-cms-docker-watch.service'].map((name) =>
        unitState(context, name),
      ),
    ),
  };
}

async function restoreFile(file: WatchFile): Promise<void> {
  if (file.content === null) await rm(file.path, { force: true });
  else {
    await atomicWrite(file.path, file.content, file.mode);
    await chown(file.path, file.uid, file.gid);
  }
}

async function attempt(action: () => Promise<unknown>, errors: unknown[]): Promise<void> {
  try {
    await action();
  } catch (error) {
    errors.push(error);
  }
}

async function stopChangedUnits(
  context: DockerContext,
  units: WatchUnit[],
  errors: unknown[],
): Promise<void> {
  for (const unit of units) {
    await attempt(async () => {
      const state = await unitState(context, unit.name);
      if (state.active) await attempt(() => context.run(['systemctl', 'stop', unit.name]), errors);
      if (state.enabled)
        await attempt(() => context.run(['systemctl', 'disable', unit.name]), errors);
    }, errors);
  }
}

async function restoreUnit(
  context: DockerContext,
  unit: WatchUnit,
  errors: unknown[],
): Promise<void> {
  if (unit.enabled) await attempt(() => context.run(['systemctl', 'enable', unit.name]), errors);
  if (unit.active) await attempt(() => context.run(['systemctl', 'start', unit.name]), errors);
  await attempt(async () => {
    const state = await unitState(context, unit.name);
    if (state.active !== unit.active || state.enabled !== unit.enabled)
      throw new Error('Docker recovery unit state was not restored');
  }, errors);
}

export async function restoreDockerWatch(
  context: DockerContext,
  snapshot: WatchSnapshot,
): Promise<void> {
  const errors: unknown[] = [];
  await stopChangedUnits(context, snapshot.units, errors);
  for (const file of snapshot.files) await attempt(() => restoreFile(file), errors);
  await attempt(() => context.run(['systemctl', 'daemon-reload']), errors);
  for (const unit of snapshot.units) await restoreUnit(context, unit, errors);
  if (errors.length > 0)
    throw new AggregateError(errors, 'Docker recovery configuration restoration failed');
}

export async function enableDockerWatch(context: DockerContext, directory: string): Promise<void> {
  const source = join(directory, 'deploy');
  const unit = (await readFile(join(source, 'docker-watch.service'), 'utf8')).replaceAll(
    '__BUN__',
    context.bun,
  );
  await atomicWrite(context.paths.unit, unit);
  await atomicWrite(
    context.paths.timer,
    await readFile(join(source, 'docker-watch.timer'), 'utf8'),
  );
  await chmod(context.paths.unit, 0o644);
  await context.run(['systemctl', 'daemon-reload']);
  await context.run(['systemctl', 'enable', '--now', 'new-cms-docker-watch.timer']);
}
