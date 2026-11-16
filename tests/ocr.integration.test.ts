import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { createWorker, OEM } from 'tesseract.js';
import { parseReceipt } from '@/features/receipt-parser';

/**
 * Prueba de integración REAL del OCR: se genera una imagen de un ticket
 * sintético y se reconoce con Tesseract usando los datos de idioma locales
 * (los mismos que se publican en /ocr). No se usa Internet.
 */

const LINES = [
  'SUPERMERCADO EJEMPLO',
  'CALLE INVENTADA 12',
  'FECHA 05/11/2026 18:42',
  '',
  'LECHE ENTERA 1L        1,20',
  'PAN MOLDE              1,50',
  'HUEVOS L               3,20',
  'ACEITE OLIVA 1L        8,50',
  '',
  'TOTAL                 14,40',
];

function receiptSvg(): string {
  const lineH = 44;
  const h = 80 + LINES.length * lineH;
  const text = LINES.map(
    (l, i) => `<text x="40" y="${70 + i * lineH}" xml:space="preserve">${l.replace(/&/g, '&amp;')}</text>`,
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${h}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <g font-family="Courier New, Consolas, monospace" font-size="32" fill="#111111">${text}</g>
  </svg>`;
}

const langPath = resolve(__dirname, '../node_modules/@tesseract.js-data/spa/4.0.0_best_int');

describe('OCR local (Tesseract.js) + parser', () => {
  it.skipIf(!existsSync(langPath))(
    'reconoce un ticket sintético en español y extrae productos y total',
    async () => {
      const png = await sharp(Buffer.from(receiptSvg())).png().toBuffer();
      const worker = await createWorker('spa', OEM.LSTM_ONLY, {
        langPath,
        cacheMethod: 'none',
        gzip: true,
      });
      try {
        await worker.setParameters({ tessedit_pageseg_mode: '4' as never, preserve_interword_spaces: '1' });
        const { data } = await worker.recognize(png);
        const parsed = parseReceipt(data.text, { today: new Date(2026, 10, 16) });
        expect(parsed.totalCents).toBe(1440);
        expect(parsed.purchaseDate).toBe('2026-11-05');
        expect(parsed.items.map((i) => i.lineTotalCents)).toEqual([120, 150, 320, 850]);
        expect(parsed.items[0].rawName).toMatch(/LECHE ENTERA/);
      } finally {
        await worker.terminate();
      }
    },
    120_000,
  );
});
