import type { EnhancementMode, PhotoQuality } from '@/types/models';
import type { ImageVariant, ReceiptImages } from '@/types/drafts';
import { sha256Hex } from '@/utils/hash';

/**
 * Procesado de imágenes en el navegador (canvas). Nada sale del dispositivo.
 * Safari en iOS limita el tamaño de un canvas (~16 Mpx), por eso todo el
 * procesado trabaja con versiones reducidas; la fotografía original se guarda
 * intacta como Blob (salvo que el usuario elija comprimirla en Ajustes).
 */

export interface Point {
  x: number;
  y: number;
}

/** Esquinas normalizadas (0..1) en orden: superior izq., superior der., inferior der., inferior izq. */
export type Quad = [Point, Point, Point, Point];

export const FULL_QUAD: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

const MAX_PROCESS_SIDE = 2400;
const THUMB_SIDE = 320;

export async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error('No se ha podido abrir la imagen. Prueba con otra fotografía (JPEG o PNG).');
  } finally {
    // La imagen ya está decodificada; se puede liberar la URL
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('El navegador no permite procesar imágenes (canvas no disponible).');
  return ctx;
}

type Drawable = HTMLImageElement | HTMLCanvasElement;

function sizeOf(src: Drawable): { w: number; h: number } {
  return src instanceof HTMLImageElement
    ? { w: src.naturalWidth, h: src.naturalHeight }
    : { w: src.width, h: src.height };
}

/** Dibuja una imagen reducida para que su lado mayor no supere maxSide. */
export function drawScaled(src: Drawable, maxSide: number): HTMLCanvasElement {
  const { w, h } = sizeOf(src);
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const c = createCanvas(w * scale, h * scale);
  const ctx = ctx2d(c);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/jpeg', quality = 0.88): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('No se ha podido generar la imagen.'))), type, quality);
  });
}

export async function canvasToVariant(c: HTMLCanvasElement, quality = 0.88): Promise<ImageVariant> {
  return { blob: await canvasToBlob(c, 'image/jpeg', quality), width: c.width, height: c.height };
}

/** Gira la imagen en múltiplos de 90 grados. */
export function rotateCanvas(src: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  const d = ((degrees % 360) + 360) % 360;
  if (d === 0) return src;
  const swap = d === 90 || d === 270;
  const c = createCanvas(swap ? src.height : src.width, swap ? src.width : src.height);
  const ctx = ctx2d(c);
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((d * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

// ---------------------------------------------------------------------------
// Corrección de perspectiva (homografía)
// ---------------------------------------------------------------------------

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const p = M[col][col];
    if (Math.abs(p) < 1e-12) throw new Error('Las esquinas seleccionadas no forman un cuadrilátero válido.');
    for (let c = col; c <= n; c++) M[col][c] /= p;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

/** Homografía que lleva los puntos `from` a los puntos `to`. */
export function homography(from: Point[], to: Point[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return [...solve(A, b), 1];
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isFullQuad(q: Quad): boolean {
  return q.every((p, i) => Math.abs(p.x - FULL_QUAD[i].x) < 0.002 && Math.abs(p.y - FULL_QUAD[i].y) < 0.002);
}

/** Recorta y endereza el cuadrilátero indicado (coordenadas normalizadas). */
export function warpQuad(src: HTMLCanvasElement, quad: Quad, maxSide = MAX_PROCESS_SIDE): HTMLCanvasElement {
  if (isFullQuad(quad)) return src;
  const pts = quad.map((p) => ({ x: p.x * src.width, y: p.y * src.height }));
  const [tl, tr, br, bl] = pts;
  let outW = Math.max(dist(tl, tr), dist(bl, br));
  let outH = Math.max(dist(tl, bl), dist(tr, br));
  const scale = Math.min(1, maxSide / Math.max(outW, outH));
  outW = Math.max(16, Math.round(outW * scale));
  outH = Math.max(16, Math.round(outH * scale));

  const H = homography(
    [
      { x: 0, y: 0 },
      { x: outW, y: 0 },
      { x: outW, y: outH },
      { x: 0, y: outH },
    ],
    pts,
  );
  const sctx = ctx2d(src);
  const sdata = sctx.getImageData(0, 0, src.width, src.height).data;
  const out = createCanvas(outW, outH);
  const octx = ctx2d(out);
  const odata = octx.createImageData(outW, outH);
  const o = odata.data;
  const sw = src.width;
  const sh = src.height;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const den = H[6] * x + H[7] * y + H[8];
      const sx = (H[0] * x + H[1] * y + H[2]) / den;
      const sy = (H[3] * x + H[4] * y + H[5]) / den;
      const oi = (y * outW + x) * 4;
      if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) {
        o[oi] = o[oi + 1] = o[oi + 2] = 255;
        o[oi + 3] = 255;
        continue;
      }
      const x0 = sx | 0;
      const y0 = sy | 0;
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      for (let c = 0; c < 3; c++) {
        const top = sdata[i00 + c] * (1 - fx) + sdata[i10 + c] * fx;
        const bot = sdata[i01 + c] * (1 - fx) + sdata[i11 + c] * fx;
        o[oi + c] = top * (1 - fy) + bot * fy;
      }
      o[oi + 3] = 255;
    }
  }
  octx.putImageData(odata, 0, 0);
  return out;
}

// ---------------------------------------------------------------------------
// Mejora de legibilidad
// ---------------------------------------------------------------------------

function toGray(d: Uint8ClampedArray): Uint8ClampedArray {
  const g = new Uint8ClampedArray(d.length / 4);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
  return g;
}

/** Escala de grises + estiramiento de contraste, o blanco y negro adaptativo. */
export function enhanceCanvas(src: HTMLCanvasElement, mode: EnhancementMode, contrast = 1): HTMLCanvasElement {
  if (mode === 'none' && contrast === 1) return src;
  const out = createCanvas(src.width, src.height);
  const octx = ctx2d(out);
  octx.drawImage(src, 0, 0);
  const img = octx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  const w = out.width;
  const h = out.height;

  if (mode === 'none') {
    for (let i = 0; i < d.length; i += 4) {
      for (let c = 0; c < 3; c++) d[i + c] = (d[i + c] - 128) * contrast + 128;
    }
    octx.putImageData(img, 0, 0);
    return out;
  }

  const gray = toGray(d);
  if (mode === 'contrast') {
    const hist = new Uint32Array(256);
    for (const v of gray) hist[v]++;
    const total = gray.length;
    let lo = 0;
    let hi = 255;
    for (let acc = 0; lo < 255 && (acc += hist[lo]) < total * 0.01; lo++);
    for (let acc = 0; hi > 0 && (acc += hist[hi]) < total * 0.01; hi--);
    // Límites para no amplificar en exceso: con poco texto sobre papel blanco el
    // percentil 1 % puede caer en el propio blanco y engordaría las letras.
    lo = Math.min(lo, 110);
    hi = Math.max(hi, 170);
    const range = Math.max(1, hi - lo);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      let v = ((gray[j] - lo) / range) * 255;
      v = (v - 128) * contrast + 128;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  } else {
    // Umbral adaptativo (media local con imagen integral): elimina sombras
    const integral = new Float64Array((w + 1) * (h + 1));
    for (let y = 1; y <= h; y++) {
      let row = 0;
      for (let x = 1; x <= w; x++) {
        row += gray[(y - 1) * w + (x - 1)];
        integral[y * (w + 1) + x] = integral[(y - 1) * (w + 1) + x] + row;
      }
    }
    const r = Math.max(8, Math.round(Math.min(w, h) / 30));
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r);
        const x1 = Math.min(w, x + r + 1);
        const sum =
          integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
        const mean = sum / ((x1 - x0) * (y1 - y0));
        const v = gray[y * w + x] < mean * 0.86 ? 0 : 255;
        const i = (y * w + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

// ---------------------------------------------------------------------------
// Detección aproximada de los bordes del ticket
// ---------------------------------------------------------------------------

/**
 * Busca la mayor región clara (el papel) sobre un fondo más oscuro y devuelve
 * sus cuatro esquinas. Es una ayuda: el usuario siempre puede ajustar las esquinas.
 * Devuelve null si no se encuentra una región fiable.
 */
export function detectReceiptQuad(src: Drawable): Quad | null {
  const small = drawScaled(src, 220);
  const w = small.width;
  const h = small.height;
  const gray = toGray(ctx2d(small).getImageData(0, 0, w, h).data);

  // Umbral de Otsu
  const hist = new Uint32Array(256);
  for (const v of gray) hist[v]++;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = gray.length - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }

  // Componente conexa clara más grande
  const labels = new Int32Array(w * h).fill(-1);
  let bestLabel = -1;
  let bestSize = 0;
  const stack: number[] = [];
  let label = 0;
  for (let i = 0; i < gray.length; i++) {
    if (labels[i] !== -1 || gray[i] <= threshold) continue;
    let size = 0;
    stack.push(i);
    labels[i] = label;
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const x = p % w;
      const y = (p - x) / w;
      const neigh = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const n of neigh) {
        if (n >= 0 && labels[n] === -1 && gray[n] > threshold) {
          labels[n] = label;
          stack.push(n);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = label;
    }
    label++;
  }
  const area = bestSize / (w * h);
  if (bestLabel < 0 || area < 0.12 || area > 0.97) return null;

  let tl = { s: Infinity, x: 0, y: 0 };
  let br = { s: -Infinity, x: 0, y: 0 };
  let tr = { s: -Infinity, x: 0, y: 0 };
  let bl = { s: Infinity, x: 0, y: 0 };
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== bestLabel) continue;
    const x = i % w;
    const y = (i - x) / w;
    if (x + y < tl.s) tl = { s: x + y, x, y };
    if (x + y > br.s) br = { s: x + y, x, y };
    if (x - y > tr.s) tr = { s: x - y, x, y };
    if (x - y < bl.s) bl = { s: x - y, x, y };
  }
  const n = (p: { x: number; y: number }): Point => ({
    x: Math.min(1, Math.max(0, p.x / (w - 1))),
    y: Math.min(1, Math.max(0, p.y / (h - 1))),
  });
  return [n(tl), n(tr), n(br), n(bl)];
}

// ---------------------------------------------------------------------------
// Hash perceptual, miniaturas y paquete de imágenes
// ---------------------------------------------------------------------------

/** dHash de 64 bits (16 caracteres hexadecimales). */
export function perceptualHash(src: Drawable): string {
  const c = createCanvas(9, 8);
  const ctx = ctx2d(c);
  ctx.drawImage(src, 0, 0, 9, 8);
  const g = toGray(ctx.getImageData(0, 0, 9, 8).data);
  let hex = '';
  for (let y = 0; y < 8; y++) {
    let nibbleHi = 0;
    let nibbleLo = 0;
    for (let x = 0; x < 8; x++) {
      const bit = g[y * 9 + x] > g[y * 9 + x + 1] ? 1 : 0;
      if (x < 4) nibbleHi = (nibbleHi << 1) | bit;
      else nibbleLo = (nibbleLo << 1) | bit;
    }
    hex += nibbleHi.toString(16) + nibbleLo.toString(16);
  }
  return hex;
}

export async function makeThumbnail(src: Drawable): Promise<ImageVariant> {
  return canvasToVariant(drawScaled(src, THUMB_SIDE), 0.75);
}

const QUALITY_PRESETS: Record<Exclude<PhotoQuality, 'original'>, { side: number; q: number }> = {
  high: { side: 2560, q: 0.9 },
  medium: { side: 1800, q: 0.82 },
};

/**
 * Prepara la fotografía original para guardarla. Con calidad "original" se
 * guarda el archivo tal cual; con "alta"/"media" se comprime para ahorrar espacio.
 */
export async function prepareOriginal(file: Blob, img: HTMLImageElement, quality: PhotoQuality): Promise<ImageVariant> {
  if (quality === 'original') return { blob: file, width: img.naturalWidth, height: img.naturalHeight };
  const preset = QUALITY_PRESETS[quality];
  const c = drawScaled(img, preset.side);
  return canvasToVariant(c, preset.q);
}

/** Construye todas las variantes y huellas de un ticket nuevo. */
export async function buildReceiptImages(
  file: Blob,
  processed: HTMLCanvasElement | null,
  quality: PhotoQuality,
): Promise<ReceiptImages> {
  const img = await loadImage(file);
  const original = await prepareOriginal(file, img, quality);
  const thumbSource = processed ?? img;
  const [thumbnail, processedVariant, contentHash] = await Promise.all([
    makeThumbnail(thumbSource),
    processed ? canvasToVariant(processed, 0.9) : Promise.resolve(null),
    file.arrayBuffer().then(sha256Hex),
  ]);
  return {
    original,
    processed: processedVariant,
    thumbnail,
    contentHash,
    perceptualHash: perceptualHash(img),
  };
}
