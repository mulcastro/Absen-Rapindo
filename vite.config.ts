import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['logo-lpk-rapindo.svg', 'logo-lpk-rapindo-1024.png'],
        manifest: {
          name: 'Absensi LPK Rapindo',
          short_name: 'Absen Rapindo',
          description: 'Aplikasi absensi pelatihan LPK Rapindo.',
          lang: 'id-ID',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#F5F5F3',
          theme_color: '#D90000',
          icons: [
            {
              src: '/logo-lpk-rapindo-1024.png',
              sizes: '1024x1024',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/logo-lpk-rapindo.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api(?:\/|$)/],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkOnly',
              method: 'GET',
            },
            ...(['POST', 'PUT', 'PATCH', 'DELETE'] as const).map((method) => ({
              urlPattern: ({ url }: { url: URL }) =>
                url.pathname.startsWith('/api/'),
              handler: 'NetworkOnly' as const,
              method,
            })),
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    build: {
      sourcemap: false,
    },
    server: {
      allowedHosts: env.VITE_ALLOWED_HOST ? [env.VITE_ALLOWED_HOST] : [],
      proxy: {
        '/api': 'http://127.0.0.1:8000',
      },
    },
  };
});
