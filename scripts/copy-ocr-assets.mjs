// Copia los recursos de Tesseract.js (worker, núcleo WASM y datos de idioma)
// desde node_modules a public/ocr para servirlos desde el propio alojamiento.
// Así el OCR no depende de ningún CDN y puede funcionar sin conexión.
import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'public', 'ocr');

const files = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js'],
  ['@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz', 'lang/spa.traineddata.gz'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'lang/eng.traineddata.gz'],
];

let copied = 0;
for (const [src, dest] of files) {
  const from = join(nm, src);
  const to = join(out, dest);
  if (!existsSync(from)) {
    console.error(`[ocr-assets] No se encuentra ${src}. Ejecuta "npm install".`);
    process.exit(1);
  }
  mkdirSync(dirname(to), { recursive: true });
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
  copyFileSync(from, to);
  copied++;
}
console.log(`[ocr-assets] Recursos OCR listos en public/ocr (${copied} copiados).`);
