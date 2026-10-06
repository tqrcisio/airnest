import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: {
    decorator: {
      legacy: true,
      emitDecoratorMetadata: true,
    },
    assumptions: { setPublicClassFields: true },
    typescript: { removeClassFieldsWithoutInitializer: true },
  },
  test: {
    globals: true,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    setupFiles: ['reflect-metadata'],
  },
});
