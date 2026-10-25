import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
import { nodeExecutable } from '../test/support/node-runtime.ts';

const ports = (process.env.CMS_ADMIN_E2E_PORTS ?? '').split(',').map(Number);
if (ports.length !== 2 || ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65535))
  throw new Error('Run browser journeys through bun run test:e2e e2e/admin-ui.browser.spec.ts.');
const [devPort, productionPort] = ports;
if (devPort === productionPort) throw new Error('Browser servers require distinct TCP ports.');
const next = resolve('apps/admin/node_modules/next/dist/bin/next');

function quote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

const servers = [
  { name: 'development', port: devPort, binary: process.execPath, mode: 'dev' },
  { name: 'production', port: productionPort, binary: nodeExecutable(), mode: 'start' },
];

export default defineConfig({
  testDir: '.',
  testMatch: '*.browser.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: servers.map((server) => ({
    name: server.name,
    use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${server.port}` },
  })),
  webServer: servers.map((server) => ({
    command: `${quote(server.binary)} ${quote(next)} ${server.mode} --hostname 127.0.0.1 --port ${server.port}`,
    cwd: resolve('apps/admin'),
    url: `http://127.0.0.1:${server.port}/ui`,
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
      NODE_ENV: server.mode === 'dev' ? 'development' : 'production',
    },
  })),
});
