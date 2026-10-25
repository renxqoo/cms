import { defineConfig } from '@playwright/test';

const ports = (process.env.CMS_ADMIN_E2E_PORTS ?? '').split(',').map(Number);
if (ports.length !== 2 || ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65535))
  throw new Error('Run browser journeys through bun run test:e2e.');
const [devPort, productionPort] = ports;
if (devPort === productionPort) throw new Error('Browser servers require distinct TCP ports.');
const servers = [
  { name: 'development', port: devPort },
  { name: 'production', port: productionPort },
];

export default defineConfig({
  testDir: '.',
  testMatch: '*.browser.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  outputDir: process.env.CMS_ADMIN_E2E_OUTPUT_DIR ?? 'test-results',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: servers.map((server) => ({
    name: server.name,
    use: {
      browserName: 'chromium' as const,
      viewport: { width: 1280, height: 720 },
      baseURL: `http://127.0.0.1:${server.port}`,
    },
  })),
});
