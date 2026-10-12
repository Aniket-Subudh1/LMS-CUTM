import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const alias = {
  '@': fileURLToPath(new URL('./', import.meta.url)),
  'server-only': fileURLToPath(new URL('./tests/server-only.ts', import.meta.url)),
};

export default defineConfig({
  test: {
    projects: [
      { resolve: { alias }, test: { name: 'unit', environment: 'node', include: ['lib/**/*.test.ts'] } },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['tests/setup.ts'],
          hookTimeout: 120_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
