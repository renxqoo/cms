import { e2ePlan } from './e2e-plan.ts';
import { browserGroups, isolatedBrowserGroup } from './browser-groups.ts';
import { availablePort } from '../test/support/tcp-port.ts';
import { createAdminApplicationProcess } from '../test/support/admin-application-process.ts';
import { basename, resolve } from 'node:path';

const contentFeatures = [
  'admin-content',
  'admin-assets',
  'admin-images',
  'admin-article-media',
  'admin-jobs',
  'admin-content-presentation',
  'admin-content-presentation-en',
  'admin-content-folders',
  'admin-content-copy',
  'admin-upload-recovery',
];

const interruption = new AbortController();
let activeChild: ReturnType<typeof Bun.spawn> | undefined;
function interrupt(signal: NodeJS.Signals) {
  process.exitCode = signal === 'SIGINT' ? 130 : 143;
  interruption.abort(new Error(`E2E interrupted by ${signal}.`));
  activeChild?.kill('SIGTERM');
}
const onSigint = () => interrupt('SIGINT');
const onSigterm = () => interrupt('SIGTERM');
process.on('SIGINT', onSigint);
process.on('SIGTERM', onSigterm);

async function run(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  interruption.signal.throwIfAborted();
  const child = Bun.spawn([process.execPath, ...args], {
    env,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  activeChild = child;
  const code = await child.exited.finally(() => {
    activeChild = undefined;
  });
  interruption.signal.throwIfAborted();
  if (code !== 0) throw new Error(`E2E command failed with exit code ${code}.`);
}

async function browserJourneys(args: string[]) {
  await run(['tooling/build-api.ts']);
  await run(['run', '--cwd', 'apps/admin', 'build'], { ...process.env, CMS_ADMIN_E2E: '1' });
  const available = Array.from(new Bun.Glob('e2e/*.browser.spec.ts').scanSync('.'));
  for (const group of browserGroups(args, available)) {
    const devPort = await availablePort();
    let productionPort = await availablePort();
    while (productionPort === devPort) productionPort = await availablePort();
    await isolatedBrowserGroup({
      signal: interruption.signal,
      open: (mode) =>
        createAdminApplicationProcess(mode, mode === 'development' ? devPort : productionPort, {
          signal: interruption.signal,
          content: contentFeatures.some(
            (feature) => basename(group[0] ?? '') === `${feature}.browser.spec.ts`,
          ),
        }),
      run: (applications) =>
        run(
          [
            '--bun',
            'node_modules/@playwright/test/cli.js',
            'test',
            '--config',
            'e2e/playwright.config.ts',
            ...group,
          ],
          {
            ...process.env,
            CMS_ADMIN_E2E_PORTS: `${devPort},${productionPort}`,
            CMS_ADMIN_E2E_API_ORIGINS: applications
              .map((application) => application.apiOrigin)
              .join(','),
            CMS_ADMIN_E2E_MAILBOXES: JSON.stringify(
              applications.map((application) => application.mailbox),
            ),
            CMS_ADMIN_E2E_OUTPUT_DIR: resolve('test-results', basename(group[0] ?? 'browser')),
          },
        ),
    });
  }
}

async function execute() {
  for (const target of e2ePlan(Bun.argv.slice(2))) {
    if (target.kind === 'browser') await browserJourneys(target.args);
    else {
      await run(['tooling/build-api.ts']);
      await run([
        '--bun',
        'node_modules/vitest/vitest.mjs',
        'run',
        '--config',
        'e2e/vitest.config.ts',
        ...target.args,
      ]);
    }
  }
}

try {
  await execute();
} catch (error) {
  console.error(error);
  process.exitCode ??= 1;
} finally {
  process.off('SIGINT', onSigint);
  process.off('SIGTERM', onSigterm);
}
