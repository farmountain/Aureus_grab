import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@aureus/kernel': resolve(__dirname, 'packages/kernel/src/index.ts'),
      '@aureus/memory-hipcortex': resolve(__dirname, 'packages/memory-hipcortex/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    deps: {
      inline: [/bcrypt/, /jsonwebtoken/],
    },
  },
});
