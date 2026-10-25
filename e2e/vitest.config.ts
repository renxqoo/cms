import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['e2e/*.spec.ts'],
    exclude: ['e2e/*.browser.spec.ts'],
    testTimeout: 60000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
