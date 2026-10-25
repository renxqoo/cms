import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tooling/**/__test__/*.test.ts',
      'packages/**/__test__/*.test.ts',
      'apps/**/__test__/*.test.ts',
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
    maxWorkers: 2,
    coverage: {
      provider: 'istanbul',
      include: ['tooling/oxlint-plugin/**/*.ts', 'packages/*/src/**/*.ts', 'apps/api/src/**/*.ts'],
      exclude: ['**/__test__/**'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
        'tooling/oxlint-plugin/**/*.ts': { statements: 90, branches: 85, functions: 90, lines: 90 },
      },
    },
  },
});
