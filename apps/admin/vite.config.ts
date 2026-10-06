import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: env.AIRNEST_ADMIN_BASE || '/',
    plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
    server: {
      port: 4300,
      proxy: { '/airnest': { target: env.AIRNEST_API_TARGET || 'http://localhost:3100', changeOrigin: true } },
    },
    preview: {
      port: 4300,
      proxy: { '/airnest': { target: env.AIRNEST_API_TARGET || 'http://localhost:3100', changeOrigin: true } },
    },
  };
});
