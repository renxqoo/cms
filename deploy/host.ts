import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { installRelease, restartRelease, rollbackRelease } from './lib/deployment';
import { releaseLink, withDeployLock } from './lib/files';
import { initializeHost } from './lib/initialize';
import {
  checkPrerequisites,
  edgeMode,
  hostPaths,
  pm2Command,
  pm2Script,
  privateFile,
  probeHealth,
  readProductionConfig,
  runCommand,
  waitForHealth,
  verifyManager,
} from './lib/system';

async function preflight() {
  const edge = await edgeMode(hostPaths);
  await checkPrerequisites(runCommand, edge);
  const config = await readProductionConfig(hostPaths);
  await runCommand([
    'runuser',
    '-u',
    'new-cms',
    '--',
    'test',
    '-r',
    `${hostPaths.config}/client.env`,
  ]);
  if (edge === 'nginx') {
    await privateFile(`${hostPaths.config}/tls/privkey.pem`, 0o600);
    const cert = await lstat(`${hostPaths.config}/tls/fullchain.pem`);
    if (!cert.isFile()) throw new Error('Install a regular TLS fullchain.pem certificate');
    await runCommand(['nginx', '-t']);
  }
  return {
    paths: hostPaths,
    config,
    run: runCommand,
    healthy: () => waitForHealth(config, runCommand),
    managerScript: await pm2Script(),
    edge,
    verifyManager: () => verifyManager(hostPaths, runCommand),
  };
}

async function status(): Promise<void> {
  const current = await releaseLink(hostPaths, 'current');
  const previous = await releaseLink(hostPaths, 'previous');
  process.stdout.write(`${JSON.stringify({ current, previous }, null, 2)}\n`);
  await verifyManager(hostPaths, runCommand);
  process.stdout.write(`${await runCommand(pm2Command(hostPaths, ['list']))}\n`);
  const config = await readProductionConfig(hostPaths);
  await probeHealth(config, runCommand);
  process.stdout.write('Client HTTP and HTTPS health checks passed.\n');
}

async function restart(): Promise<void> {
  const deployment = await preflight();
  await verifyManager(hostPaths, runCommand);
  await restartRelease(deployment);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((value, index) => value !== '--' || index !== 0);
  const [command] = args;
  if (args.length === 0 || command === '--help') {
    process.stdout.write(
      'Usage: bun deploy/host.ts init [--edge=nginx|external] | install|rollback|restart|check|status\n',
    );
    return;
  }
  if (
    (args.length !== 1 &&
      !(command === 'init' && args.length === 2 && /^--edge=(nginx|external)$/.test(args[1]))) ||
    !['init', 'install', 'rollback', 'restart', 'check', 'status'].includes(command)
  )
    throw new Error('Unsupported deployment command; run with --help');
  if (process.platform !== 'linux' || process.getuid?.() !== 0 || Bun.version !== '1.4.4')
    throw new Error('Host deployment requires Linux, root and Bun 1.4.4');
  const source = resolve(import.meta.dirname, '..');
  await withDeployLock(hostPaths, async () => {
    if (command === 'init') {
      await initializeHost(source, hostPaths, runCommand);
      const { initializeEdge } = await import('./lib/initialize');
      await initializeEdge(hostPaths, args[1]?.slice('--edge='.length) ?? 'nginx');
    } else if (command === 'status') await status();
    else if (command === 'restart') await restart();
    else {
      const deployment = await preflight();
      if (command === 'install') await installRelease(source, deployment);
      else if (command === 'rollback') await rollbackRelease(deployment);
      else {
        await verifyManager(hostPaths, runCommand);
        await deployment.healthy();
        const dump = await readFile(`${hostPaths.home}/.pm2/dump.pm2`, 'utf8');
        const env = await readFile(`${hostPaths.config}/client.env`, 'utf8');
        const token = env
          .split('\n')
          .find((line) => line.startsWith('LOGIN_PROXY_TOKEN='))
          ?.slice('LOGIN_PROXY_TOKEN='.length);
        if (dump.includes('LOGIN_PROXY_TOKEN') || (token && dump.includes(token)))
          throw new Error('PM2 saved environment contains a secret key');
      }
    }
  });
  process.stdout.write(`Client ${command} completed.\n`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Client deployment failed');
  process.exitCode = 1;
}
