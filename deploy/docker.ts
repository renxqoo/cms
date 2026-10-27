import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dockerContext } from './lib/docker-command';
import { checkDocker, initDocker, installDocker, rollbackDocker } from './lib/docker-lifecycle';
import { statusDocker, watchDocker } from './lib/docker-watch';

async function main(): Promise<void> {
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid?.() !== 0)
    throw new Error('Docker host deployment requires root on Linux x64');
  if (Bun.version !== '1.4.4') throw new Error('Docker host deployment requires Bun 1.4.4');
  const context = dockerContext();
  const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const [, , command] = process.argv;
  if (process.argv.length !== 3)
    throw new Error('Usage: bun deploy/docker.ts init|install|check|status|rollback|watch');
  if (command === 'init') await initDocker(context, source);
  else if (command === 'install') await installDocker(context, source);
  else if (command === 'check') await checkDocker(context);
  else if (command === 'rollback') await rollbackDocker(context);
  else if (command === 'watch') await watchDocker(context);
  else if (command === 'status') process.stdout.write(`${await statusDocker(context)}\n`);
  else throw new Error('Usage: bun deploy/docker.ts init|install|check|status|rollback|watch');
  if (command !== 'status' && command !== 'watch')
    process.stdout.write(`Docker ${command} completed\n`);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Docker deployment failed'}\n`,
    );
    process.exitCode = 1;
  }
}
