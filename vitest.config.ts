import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tooling/**/__test__/*.test.ts'],
    coverage: {
      provider: 'istanbul',
      include: ['tooling/oxlint-plugin/**/*.ts'],
      exclude: ['tooling/oxlint-plugin/**/__test__/**'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});
