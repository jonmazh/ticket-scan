import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

/**
 * Comprobaciones de la PWA. Las de dist/ requieren haber ejecutado "npm run build"
 * (el comando "npm run verify" lo hace todo en orden).
 */
const root = resolve(__dirname, '..');
const dist = resolve(root, 'dist');
const hasDist = existsSync(resolve(dist, 'sw.js'));

describe('PWA: recursos fuente', () => {
  it('index.html tiene los metadatos de iOS y viewport con safe areas', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    expect(html).toContain('lang="es"');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('apple-mobile-web-app-capable');
    expect(html).toContain('apple-mobile-web-app-title" content="TicketScan"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3)/); // sin recursos externos
  });

  it.each([
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['maskable-512.png', 512],
    ['apple-touch-icon.png', 180],
  ])('icono %s mide %ipx', async (file, size) => {
    const meta = await sharp(resolve(root, 'public/icons', file)).metadata();
    expect(meta.width).toBe(size);
    expect(meta.height).toBe(size);
  });

  it('los recursos OCR están disponibles localmente (sin CDN)', () => {
    for (const f of ['worker.min.js', 'core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js', 'lang/spa.traineddata.gz']) {
      expect(existsSync(resolve(root, 'public/ocr', f)), f).toBe(true);
    }
    const ocrService = readFileSync(resolve(root, 'src/features/ocr/ocrService.ts'), 'utf8');
    expect(ocrService).not.toMatch(/jsdelivr|unpkg|https?:\/\//i);
    expect(ocrService).toContain("workerPath: OCR_WORKER_PATH");
  });
});

describe.skipIf(!hasDist)('PWA: compilación (dist)', () => {
  it('manifest con los campos necesarios', () => {
    const m = JSON.parse(readFileSync(resolve(dist, 'manifest.webmanifest'), 'utf8'));
    expect(m.name).toBe('TicketScan');
    expect(m.short_name).toBe('TicketScan');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/');
    expect(m.theme_color).toBeTruthy();
    expect(m.background_color).toBeTruthy();
    const sizes = m.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}:${i.purpose ?? 'any'}`);
    expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
  });

  it('el service worker precachea la app y el OCR en español', () => {
    const sw = readFileSync(resolve(dist, 'sw.js'), 'utf8');
    for (const url of [
      'index.html',
      'ocr/worker.min.js',
      'ocr/core/tesseract-core-simd-lstm.wasm.js',
      'ocr/core/tesseract-core-lstm.wasm.js',
      'ocr/lang/spa.traineddata.gz',
      'icons/icon-192.png',
    ]) {
      expect(sw).toContain(`"${url}"`);
    }
    expect(sw).toContain('NavigationRoute');
    // Sin duplicados en la lista de precarga
    const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('no incluye analítica ni servicios externos en el código compilado', () => {
    const assets = readFileSync(resolve(dist, 'index.html'), 'utf8');
    const jsFile = /src="\/(assets\/index-[^"]+\.js)"/.exec(assets)![1];
    const js = readFileSync(resolve(dist, jsFile), 'utf8');
    expect(js).not.toMatch(/google-analytics|googletagmanager|firebase|supabase|api\.openai|vision\.googleapis|sentry\.io|mixpanel|segment\.io/i);
    expect(existsSync(resolve(dist, '_headers'))).toBe(true);
  });
});
