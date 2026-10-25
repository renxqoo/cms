import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'server',
          include: [
            'tooling/**/__test__/*.test.ts',
            'packages/cms/**/__test__/*.test.ts',
            'packages/database/**/__test__/*.test.ts',
            'apps/api/**/__test__/*.test.ts',
          ],
          testTimeout: 30000,
          hookTimeout: 30000,
          maxWorkers: 2,
        },
      },
      {
        resolve: {
          alias: {
            'server-only': fileURLToPath(
              new URL('./apps/admin/node_modules/server-only/empty.js', import.meta.url),
            ),
          },
        },
        test: {
          name: 'admin-server',
          include: ['apps/admin/src/{server,contracts,api}/**/__test__/*.test.ts'],
          environment: 'node',
          testTimeout: 30000,
          hookTimeout: 30000,
          maxWorkers: 2,
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'ui',
          include: [
            'packages/ui/**/__test__/*.test.{ts,tsx}',
            'apps/admin/**/__test__/*.test.{ts,tsx}',
          ],
          exclude: ['apps/admin/src/{server,contracts,api}/**'],
          environment: 'jsdom',
          environmentOptions: { jsdom: { pretendToBeVisual: true } },
          setupFiles: ['./test/support/react.ts'],
          testTimeout: 15000,
          maxWorkers: 2,
        },
      },
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
    maxWorkers: 2,
    coverage: {
      provider: 'istanbul',
      include: [
        'tooling/oxlint-plugin/**/*.ts',
        'packages/*/src/**/*.{ts,tsx}',
        'apps/api/src/**/*.ts',
        'apps/admin/src/**/*.{ts,tsx}',
      ],
      exclude: ['**/__test__/**'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
        'tooling/oxlint-plugin/**/*.ts': { statements: 90, branches: 85, functions: 90, lines: 90 },
        'packages/ui/src/**/*.{ts,tsx}': { statements: 90, branches: 85, functions: 90, lines: 90 },
        'apps/admin/src/**/*.{ts,tsx}': { statements: 90, branches: 85, functions: 90, lines: 90 },
      },
    },
  },
});
