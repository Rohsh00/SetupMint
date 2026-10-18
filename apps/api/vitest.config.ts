import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 120000,
    hookTimeout: 180000,
    fileParallelism: false,
    maxWorkers: 1,
    setupFiles: ['./test/setup.ts'],
  },
});
