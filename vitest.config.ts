import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'virtual:pwa-register': new URL(
        './src/test/pwaRegisterMock.ts',
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
    exclude: ['e2e/**', 'e2e-live/**', 'node_modules/**', 'dist/**'],
  },
});
