import { spawn } from 'bun';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseProductionConfig } from './config';
import { probeDockerHealth } from './docker-health';
import { dockerPaths } from './docker-types';
import type { DockerContext, DockerPaths, DockerRun, DockerState } from './docker-types';
import { jsonObject, singleObject } from './docker-json';

export async function runDockerCommand(command: string[]): Promise<string> {
  const child = spawn(command, {
    env: { PATH: '/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C' },
    stdin: 'ignore',
    detached: true,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  function terminate() {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  }
  const timeout = setTimeout(terminate, 60_000);
  try {
    const [status, output] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (status !== 0) throw new Error(`${command[0]} ${command[1] ?? ''} failed (${status})`);
    return output.trim();
  } finally {
    clearTimeout(timeout);
    terminate();
    await child.exited;
  }
}

export async function dockerConfig(paths: DockerPaths) {
  const info = await lstat(paths.env);
  if (!info.isFile() || info.uid !== 0 || (info.mode & 0o777) !== 0o600)
    throw new Error('Docker environment must be a root-owned regular file with mode 600');
  const config = parseProductionConfig(await readFile(paths.env, 'utf8'));
  if (config.port !== 9091) throw new Error('Docker host deployment requires API_PORT=9091');
  return config;
}

export function dockerContext(paths = dockerPaths): DockerContext {
  return {
    paths,
    run: runDockerCommand,
    config: () => dockerConfig(paths),
    health: (config) => probeDockerHealth(config, runDockerCommand),
    delay: (milliseconds) => Bun.sleep(milliseconds),
    now: Date.now,
    bun: process.execPath,
  };
}

export function composeCommand(directory: string, args: string[]): string[] {
  return [
    'docker',
    'compose',
    '-p',
    'new-cms',
    '--env-file',
    join(directory, 'image.env'),
    '-f',
    join(directory, 'deploy/compose.host.yaml'),
    ...args,
  ];
}

export async function containerState(
  directory: string,
  run: DockerRun,
): Promise<DockerState | null> {
  const id = await run(composeCommand(directory, ['ps', '--all', '--quiet', 'cms']));
  if (!id) return null;
  if (!/^[a-f0-9]{12,64}$/.test(id)) throw new Error('Unexpected Client container identity');
  const item = singleObject(
    JSON.parse(
      await run([
        'docker',
        'inspect',
        '--format',
        '[{"Image":{{json .Image}},"State":{{json .State}}}]',
        id,
      ]),
    ),
  );
  if (
    !jsonObject(item.State) ||
    typeof item.State.Running !== 'boolean' ||
    typeof item.Image !== 'string'
  )
    throw new Error('Unexpected Client container state');
  const health = item.State.Health;
  return {
    id,
    running: item.State.Running,
    health: jsonObject(health) && typeof health.Status === 'string' ? health.Status : 'missing',
    imageId: item.Image,
  };
}

export async function dockerPrerequisites(context: DockerContext): Promise<void> {
  if (!/^\/(?:usr\/local\/bin|usr\/bin)\/[A-Za-z0-9_.-]+$/.test(context.bun))
    throw new Error('Install Bun 1.4.4 in /usr/local/bin or /usr/bin for the recovery service');
  const platform = await context.run([
    'docker',
    'info',
    '--format',
    '{{.OSType}}/{{.Architecture}}',
  ]);
  if (!['linux/x86_64', 'linux/amd64'].includes(platform))
    throw new Error('Docker daemon must run Linux amd64');
  await context.run(['docker', 'compose', 'version']);
  await context.run(['systemctl', '--version']);
  await context.run(['curl', '--version']);
}
