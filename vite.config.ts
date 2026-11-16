/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

// Misma política de seguridad que public/_headers (Cloudflare Pages), para probarla con "npm run preview"
const CSP = readFileSync(new URL('./public/_headers', import.meta.url), 'utf-8')
  .split(/\r?\n/)
  .find((l) => l.trim().startsWith('Content-Security-Policy:'))!
  .split('Content-Security-Policy:')[1]
  .trim();

export default defineConfig({
  preview: {
    headers: { 'Content-Security-Policy': CSP, 'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()' },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      // Los iconos y el favicon ya entran por globPatterns: se evita duplicarlos en la precaché
      includeAssets: [],
      includeManifestIcons: false,
      manifest: {
        id: '/',
        name: 'TicketScan',
        short_name: 'TicketScan',
        description: 'Fotografía tus tickets de compra y controla tu gasto por producto. Todo se guarda en tu dispositivo.',
        lang: 'es-ES',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#F5F6F8',
        background_color: '#F5F6F8',
        categories: ['finance', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precarga la aplicación completa y los recursos OCR en español
        // (worker, núcleo WASM y datos de idioma) para que funcione sin conexión.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}', 'ocr/lang/spa.traineddata.gz'],
        globIgnores: ['ocr/lang/eng.traineddata.gz'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Idiomas OCR opcionales (inglés): se guardan en caché al usarlos por primera vez.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/ocr/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ticketscan-ocr-extra',
              expiration: { maxEntries: 10 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: ['es2020', 'safari15'],
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
  },
});
