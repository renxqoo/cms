import { e2ePlan } from './e2e-plan.ts';
import { availablePort } from '../test/support/tcp-port.ts';

async function run(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const child = Bun.spawn([process.execPath, ...args], {
    env,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const code = await child.exited;
  if (code !== 0) process.exit(code);
}

for (const target of e2ePlan(Bun.argv.slice(2))) {
  if (target.kind === 'api') {
    await run(['tooling/build-api.ts']);
    await run([
      '--bun',
      'node_modules/vitest/vitest.mjs',
      'run',
      '--config',
      'e2e/vitest.config.ts',
      ...target.args,
    ]);
  } else {
    await run(['run', '--cwd', 'apps/admin', 'build']);
    const devPort = await availablePort();
    let productionPort = await availablePort();
    while (productionPort === devPort) productionPort = await availablePort();
    await run(
      [
        '--bun',
        'node_modules/@playwright/test/cli.js',
        'test',
        '--config',
        'e2e/playwright.config.ts',
        ...target.args,
      ],
      { ...process.env, CMS_ADMIN_E2E_PORTS: `${devPort},${productionPort}` },
    );
  }
}
