import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'e2e', 'client'],
    testTimeout: 10000,
    // Disable threads for cleaner module mocking with vi.mock
    pool: 'forks',
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
