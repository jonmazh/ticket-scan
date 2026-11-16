import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import type { OcrLanguage } from '@/types/models';

/**
 * OCR local con Tesseract.js. El worker, el núcleo WebAssembly y los datos de
 * idioma se sirven desde /ocr en el propio alojamiento (copiados desde
 * node_modules por scripts/copy-ocr-assets.mjs). No se usa ningún CDN.
 */

export const OCR_BASE = '/ocr';
export const OCR_WORKER_PATH = `${OCR_BASE}/worker.min.js`;
export const OCR_CORE_PATH = `${OCR_BASE}/core`;
export const OCR_LANG_PATH = `${OCR_BASE}/lang`;

export const OCR_LANGUAGE_LABEL: Record<OcrLanguage, string> = { spa: 'Español', eng: 'Inglés' };

export interface OcrProgress {
  stage: 'loading' | 'initializing' | 'recognizing' | 'done';
  /** 0..1 */
  progress: number;
  message: string;
}

export interface OcrResult {
  text: string;
  /** Confianza media de Tesseract (0..100). */
  confidence: number;
}

let worker: Worker | null = null;
let workerKey = '';
let progressListener: ((p: OcrProgress) => void) | null = null;

function stageFromStatus(status: string): OcrProgress['stage'] {
  if (status.includes('recognizing')) return 'recognizing';
  if (status.includes('initializ') || status.includes('loaded')) return 'initializing';
  return 'loading';
}

function messageFor(stage: OcrProgress['stage']): string {
  switch (stage) {
    case 'loading':
      return 'Cargando el motor de reconocimiento…';
    case 'initializing':
      return 'Preparando el idioma…';
    case 'recognizing':
      return 'Analizando ticket';
    case 'done':
      return 'Análisis completado';
  }
}

async function getWorker(langs: OcrLanguage[], psm: string): Promise<Worker> {
  const key = `${langs.join('+')}|${psm}`;
  if (worker && workerKey === key) return worker;
  if (worker) {
    await worker.terminate().catch(() => undefined);
    worker = null;
  }
  const w = await createWorker(langs, OEM.LSTM_ONLY, {
    workerPath: OCR_WORKER_PATH,
    corePath: OCR_CORE_PATH,
    langPath: OCR_LANG_PATH,
    workerBlobURL: false,
    gzip: true,
    logger: (m: { status: string; progress: number }) => {
      const stage = stageFromStatus(m.status);
      progressListener?.({ stage, progress: m.progress ?? 0, message: messageFor(stage) });
    },
    errorHandler: () => undefined,
  });
  await w.setParameters({
    tessedit_pageseg_mode: psm as PSM,
    preserve_interword_spaces: '1',
  });
  worker = w;
  workerKey = key;
  return w;
}

/**
 * Reconoce el texto de una imagen. Lanza errores con mensajes comprensibles.
 * El texto reconocido no se registra en consola ni se envía a ningún sitio.
 */
export async function recognizeImage(
  image: HTMLCanvasElement | Blob,
  options: { languages: OcrLanguage[]; pageSegMode: string; onProgress?: (p: OcrProgress) => void },
): Promise<OcrResult> {
  progressListener = options.onProgress ?? null;
  options.onProgress?.({ stage: 'loading', progress: 0, message: messageFor('loading') });
  try {
    const w = await getWorker(options.languages.length ? options.languages : ['spa'], options.pageSegMode);
    const { data } = await w.recognize(image);
    options.onProgress?.({ stage: 'done', progress: 1, message: messageFor('done') });
    return { text: data.text ?? '', confidence: data.confidence ?? 0 };
  } catch (err) {
    // Si el worker quedó en mal estado, se descarta para reintentar limpio
    if (worker) {
      await worker.terminate().catch(() => undefined);
      worker = null;
    }
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const msg = offline
      ? 'No hay conexión y los recursos del OCR no están disponibles en este dispositivo todavía.'
      : 'No se ha podido ejecutar el reconocimiento de texto.';
    throw new Error(msg, { cause: err });
  } finally {
    progressListener = null;
  }
}

export async function terminateOcr(): Promise<void> {
  if (worker) {
    await worker.terminate().catch(() => undefined);
    worker = null;
  }
}

/** Archivos necesarios para el OCR según los idiomas elegidos. */
export function requiredOcrFiles(langs: OcrLanguage[]): string[] {
  return [
    OCR_WORKER_PATH,
    `${OCR_CORE_PATH}/tesseract-core-simd-lstm.wasm.js`,
    `${OCR_CORE_PATH}/tesseract-core-lstm.wasm.js`,
    ...langs.map((l) => `${OCR_LANG_PATH}/${l}.traineddata.gz`),
  ];
}

export interface OcrAvailability {
  /** Todos los archivos están en la caché del service worker. */
  cachedForOffline: boolean;
  missing: string[];
  serviceWorkerActive: boolean;
}

/** Comprueba si los recursos del OCR están guardados para uso sin conexión. */
export async function checkOcrOfflineAvailability(langs: OcrLanguage[]): Promise<OcrAvailability> {
  const files = requiredOcrFiles(langs);
  const serviceWorkerActive = typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;
  if (typeof caches === 'undefined') return { cachedForOffline: false, missing: files, serviceWorkerActive };
  const missing: string[] = [];
  for (const f of files) {
    const hit = await caches.match(f, { ignoreSearch: true });
    if (!hit) missing.push(f);
  }
  return { cachedForOffline: missing.length === 0, missing, serviceWorkerActive };
}

/**
 * Descarga los recursos OCR que falten para que queden en la caché del
 * service worker (las peticiones pasan por él).
 */
export async function prepareOcrOffline(langs: OcrLanguage[]): Promise<OcrAvailability> {
  const status = await checkOcrOfflineAvailability(langs);
  for (const f of status.missing) {
    const res = await fetch(f, { cache: 'reload' });
    if (!res.ok) throw new Error(`No se ha podido descargar ${f}`);
    if (typeof caches !== 'undefined') {
      const cache = await caches.open('ticketscan-ocr-extra');
      await cache.put(f, res.clone());
    }
    await res.arrayBuffer();
  }
  return checkOcrOfflineAvailability(langs);
}
