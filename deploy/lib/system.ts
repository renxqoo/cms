import { spawn } from 'bun';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseProductionConfig } from './config';
import type { ProductionConfig } from './config';

export type RunCommand = (command: string[]) => Promise<string>;
export type EdgeMode = 'nginx' | 'external';

export interface HostPaths {
  root: string;
  config: string;
  cache: string;
  home: string;
  unit: string;
  resources: string;
  ecosystem: string;
  logrotate: string;
  pm2: string;
  nginx: string;
  lock: string;
}

export const hostPaths: HostPaths = {
  root: '/opt/new-cms',
  config: '/etc/new-cms',
  cache: '/var/cache/new-cms',
  home: '/var/lib/new-cms',
  unit: '/etc/systemd/system/pm2-new-cms.service',
  resources: '/etc/systemd/system/pm2-new-cms.service.d/resources.conf',
  ecosystem: '/etc/new-cms/ecosystem.config.cjs',
  logrotate: '/etc/logrotate.d/new-cms',
  pm2: Bun.which('pm2', { PATH: '/usr/local/bin:/usr/bin:/bin' }) ?? '/usr/local/bin/pm2',
  nginx: '/etc/nginx/conf.d/new-cms.conf',
  lock: '/run/new-cms-deploy.lock',
};

export async function runCommand(command: string[]): Promise<string> {
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
    const [status, output, error] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (status !== 0)
      throw new Error(`${command[0]} ${command[1] ?? ''} failed (${status}): ${error.trim()}`);
    if (command[0] === 'nginx' && error.includes('conflicting server name'))
      throw new Error('Nginx contains a conflicting server name; resolve the existing site first');
    return output.trim();
  } finally {
    clearTimeout(timeout);
    terminate();
    await child.exited;
  }
}

export async function privateFile(path: string, mode = 0o640): Promise<void> {
  const info = await lstat(path);
  if (!info.isFile() || info.uid !== 0 || (info.mode & 0o777) !== mode)
    throw new Error(`${path} must be a regular root-owned file with mode ${mode.toString(8)}`);
}

export async function readProductionConfig(paths: HostPaths): Promise<ProductionConfig> {
  const env = `${paths.config}/cms.env`;
  await privateFile(env);
  return parseProductionConfig(await readFile(env, 'utf8'));
}

export async function checkPrerequisites(run: RunCommand, edge: EdgeMode): Promise<void> {
  if ((await run(['/usr/bin/node', '--version'])) !== 'v24.22.1')
    throw new Error('/usr/bin/node must be Node.js 24.22.1');
  await run(['systemctl', '--version']);
  if (edge === 'nginx') await run(['nginx', '-v']);
  await run(['curl', '--version']);
  if (!Bun.which('pm2', { PATH: '/usr/local/bin:/usr/bin:/bin' }))
    throw new Error('Install a pinned PM2 release in /usr/local/bin or /usr/bin');
}

export async function edgeMode(paths: HostPaths): Promise<EdgeMode> {
  const mode = (await readFile(`${paths.config}/edge-mode`, 'utf8')).trim();
  if (mode !== 'nginx' && mode !== 'external') throw new Error('Unknown configured edge mode');
  return mode;
}

export function pm2Command(paths: HostPaths, args: string[]): string[] {
  return [
    'runuser',
    '-u',
    'new-cms',
    '--',
    'env',
    '-i',
    'PATH=/usr/local/bin:/usr/bin:/bin',
    `HOME=${paths.home}`,
    `PM2_HOME=${paths.home}/.pm2`,
    '/usr/bin/node',
    paths.pm2,
    ...args,
  ];
}

export async function pm2Script(): Promise<string> {
  const executable = Bun.which('pm2', { PATH: '/usr/local/bin:/usr/bin:/bin' });
  if (!executable) throw new Error('PM2 executable is missing');
  const script = await realpath(executable);
  const info = await lstat(script);
  if (
    !info.isFile() ||
    info.uid !== 0 ||
    (info.mode & 0o022) !== 0 ||
    !/^[A-Za-z0-9_./-]+$/.test(script) ||
    script.startsWith('/root/') ||
    script.startsWith('/home/')
  )
    throw new Error('PM2 must be root-owned and installed in a system directory');
  const metadata: unknown = JSON.parse(
    await readFile(resolve(dirname(script), '../package.json'), 'utf8'),
  );
  if (
    typeof metadata !== 'object' ||
    metadata === null ||
    !('version' in metadata) ||
    metadata.version !== '7.1.0'
  )
    throw new Error('This deployment requires the verified PM2 7.1.0 release');
  return script;
}

export async function probeHealth(config: ProductionConfig, run: RunCommand): Promise<void> {
  for (const path of ['/livez', '/readyz']) {
    const readiness = path.endsWith('readyz');
    const response = await fetch(`http://127.0.0.1:${config.port}${path}`, {
      redirect: 'error',
      signal: AbortSignal.timeout(4000),
    });
    const body: unknown = await response.json();
    const key = readiness ? 'status' : 'status';
    if (readiness) assertOptionalReadiness(response.status, body);
    else assertHealthResponse(response.status, body, key);
    const output = await run([
      'curl',
      '--silent',
      '--show-error',
      '--noproxy',
      '*',
      '--max-time',
      '5',
      '--write-out',
      '\n%{http_code}',
      ...(readiness ? [] : ['--fail']),
      '--resolve',
      `${config.hostname}:443:127.0.0.1`,
      `${config.origin}${path}`,
    ]);
    const split = output.lastIndexOf('\n');
    if (readiness)
      assertOptionalReadiness(Number(output.slice(split + 1)), JSON.parse(output.slice(0, split)));
    else
      assertHealthResponse(
        Number(output.slice(split + 1)),
        JSON.parse(output.slice(0, split)),
        key,
      );
  }
}

function assertOptionalReadiness(status: number, body: unknown): void {
  if (status === 503) {
    if (typeof body !== 'object' || body === null || Reflect.get(body, 'ready') !== false)
      throw new Error('Client readiness body must report ready=false while degraded');
    return;
  }
  assertHealthResponse(status, body, 'ready');
}

function assertHealthResponse(status: number, body: unknown, key: string): void {
  if (
    status !== 200 ||
    typeof body !== 'object' ||
    body === null ||
    !(key in body) ||
    Reflect.get(body, key) !== true
  )
    throw new Error(`Client ${key} check must return HTTP 200 and ${key}=true`);
}

export async function waitForHealth(config: ProductionConfig, run: RunCommand): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      await probeHealth(config, run);
      return;
    } catch {
      await Bun.sleep(1000);
    }
  }
  throw new Error(
    'Client did not become healthy within 60 seconds; inspect the Client container or PM2 logs',
  );
}

export async function verifyManager(paths: HostPaths, run: RunCommand): Promise<void> {
  await run(['systemctl', 'is-active', '--quiet', 'pm2-new-cms']);
  const main = await run(['systemctl', 'show', '--property=MainPID', '--value', 'pm2-new-cms']);
  const pid = (await readFile(`${paths.home}/.pm2/pm2.pid`, 'utf8')).trim();
  if (!/^[1-9]\d*$/.test(pid) || pid !== main)
    throw new Error('PM2 must be owned by the dedicated systemd startup service');
  const group = await run([
    'systemctl',
    'show',
    '--property=ControlGroup',
    '--value',
    'pm2-new-cms',
  ]);
  const worker = (await run(pm2Command(paths, ['pid', 'new-cms']))).trim();
  if (
    !/^[1-9]\d*$/.test(worker) ||
    !group ||
    !(await readFile(`/proc/${worker}/cgroup`, 'utf8'))
      .split('\n')
      .some((line) => line.endsWith(`:${group}`))
  )
    throw new Error('Client is not running inside the resource-limited PM2 service');
}
