import { Zip, ZipDeflate, ZipPassThrough, strFromU8, strToU8, unzipSync } from 'fflate';
import { getDb, getMainDb, type TicketScanDB } from '@/database/db';
import { CURRENT_SCHEMA_VERSION } from '@/database/schema';
import type {
  AppSettings,
  Product,
  ProductAlias,
  Receipt,
  ReceiptAdjustment,
  ReceiptItem,
  ReferenceCounter,
  StoredImage,
} from '@/types/models';
import { isValidLocalDate } from '@/utils/dates';
import { newId } from '@/utils/id';
import { formatReference, parseReference } from './receiptService';
import { getSettings, updateSettings } from './settingsService';

/**
 * Copias de seguridad completas en ZIP:
 *   backup.json            -> todos los datos (sin binarios)
 *   images/original/...    -> fotografías originales
 *   images/processed/...   -> versiones recortadas/mejoradas
 *   images/thumbnail/...   -> miniaturas
 */

export const BACKUP_FORMAT = 'ticketscan-backup';
export const BACKUP_FORMAT_VERSION = 1;

type ImageMeta = Omit<StoredImage, 'blob'> & { file: string };

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  appVersion: string;
  schemaVersion: number;
  exportedAt: string;
  data: {
    receipts: Receipt[];
    receiptItems: ReceiptItem[];
    products: Product[];
    productAliases: ProductAlias[];
    receiptAdjustments: ReceiptAdjustment[];
    counters: ReferenceCounter[];
    images: ImageMeta[];
    settings: Partial<AppSettings> | null;
  };
}

function extFor(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('heic')) return 'heic';
  if (mime.includes('heif')) return 'heif';
  return 'jpg';
}

declare const __APP_VERSION__: string;
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

export async function exportBackup(onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const db = getDb();
  const [receipts, receiptItems, products, productAliases, receiptAdjustments, counters, imageKeys] = await Promise.all([
    db.receipts.toArray(),
    db.receiptItems.toArray(),
    db.products.toArray(),
    db.productAliases.toArray(),
    db.receiptAdjustments.toArray(),
    db.counters.toArray(),
    db.images.toCollection().primaryKeys(),
  ]);
  const settings = await getSettings();

  const chunks: Uint8Array[] = [];
  let resolveDone!: () => void;
  let rejectDone!: (e: Error) => void;
  const done = new Promise<void>((res, rej) => {
    resolveDone = res;
    rejectDone = rej;
  });
  const zip = new Zip((err, data, final) => {
    if (err) {
      rejectDone(err);
      return;
    }
    chunks.push(data);
    if (final) resolveDone();
  });

  const imagesMeta: ImageMeta[] = [];
  let processed = 0;
  // Las imágenes se leen de una en una para no cargar todas en memoria a la vez
  for (const id of imageKeys) {
    const img = await db.images.get(id);
    if (!img) continue;
    const file = `images/${img.kind}/${img.id}.${extFor(img.mimeType)}`;
    const { blob, ...meta } = img;
    imagesMeta.push({ ...meta, file });
    const entry = new ZipPassThrough(file);
    zip.add(entry);
    entry.push(new Uint8Array(await blob.arrayBuffer()), true);
    processed++;
    onProgress?.(processed, imageKeys.length);
  }

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: APP_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      receipts,
      receiptItems,
      products,
      productAliases,
      receiptAdjustments,
      counters,
      images: imagesMeta,
      settings: { ...settings, lastBackupAt: null },
    },
  };
  const json = new ZipDeflate('backup.json', { level: 6 });
  zip.add(json);
  json.push(strToU8(JSON.stringify(manifest, null, 2)), true);
  zip.end();
  await done;
  return new Blob(chunks as BlobPart[], { type: 'application/zip' });
}

export async function markBackupDone(): Promise<void> {
  await updateSettings({ lastBackupAt: new Date().toISOString() });
}

// ---------------------------------------------------------------------------
// Importación
// ---------------------------------------------------------------------------

export interface ParsedBackup {
  manifest: BackupManifest;
  files: Record<string, Uint8Array>;
  summary: {
    receipts: number;
    products: number;
    items: number;
    images: number;
    exportedAt: string;
    firstDate: string | null;
    lastDate: string | null;
  };
}

export class BackupValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`La copia de seguridad no es válida: ${problems.slice(0, 3).join(' ')}`);
    this.name = 'BackupValidationError';
  }
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isIntOrNull = (v: unknown) => v === null || isInt(v);

export function validateManifest(m: unknown, files: Record<string, Uint8Array>): string[] {
  const p: string[] = [];
  const man = m as Partial<BackupManifest>;
  if (!man || man.format !== BACKUP_FORMAT) return ['El archivo no es una copia de TicketScan.'];
  if (!isInt(man.formatVersion) || man.formatVersion > BACKUP_FORMAT_VERSION) {
    return ['La copia procede de una versión más reciente de TicketScan. Actualiza la aplicación.'];
  }
  const d = man.data;
  if (!d) return ['Faltan los datos de la copia.'];
  const arrays = ['receipts', 'receiptItems', 'products', 'productAliases', 'receiptAdjustments', 'counters', 'images'] as const;
  for (const k of arrays) if (!Array.isArray(d[k])) p.push(`Falta la sección ${k}.`);
  if (p.length) return p;

  const receiptIds = new Set<string>();
  const refs = new Set<string>();
  for (const r of d.receipts) {
    if (!isStr(r.id) || !isStr(r.reference) || !parseReference(r.reference)) p.push(`Ticket con referencia no válida (${String(r.reference)}).`);
    else if (refs.has(r.reference)) p.push(`Referencia duplicada ${r.reference}.`);
    if (!isValidLocalDate(r.purchaseDate)) p.push(`Fecha no válida en ${r.reference}.`);
    if (!isIntOrNull(r.printedTotalCents) || !isInt(r.calculatedItemsTotalCents)) p.push(`Importes no válidos en ${r.reference}.`);
    receiptIds.add(r.id);
    refs.add(r.reference);
  }
  const productIds = new Set(d.products.map((x) => x.id));
  for (const pr of d.products) if (!isStr(pr.id) || !isStr(pr.canonicalName)) p.push('Producto no válido.');
  for (const it of d.receiptItems) {
    if (!receiptIds.has(it.receiptId)) p.push('Línea de producto sin ticket.');
    if (!productIds.has(it.productId)) p.push('Línea de producto sin producto.');
    if (!isInt(it.lineTotalCents) || !isInt(it.unitPriceCents) || typeof it.quantity !== 'number') {
      p.push('Línea de producto con importes no válidos.');
    }
  }
  for (const a of d.productAliases) if (!productIds.has(a.productId)) p.push('Alias sin producto.');
  for (const a of d.receiptAdjustments) {
    if (!receiptIds.has(a.receiptId) || !isInt(a.amountCents)) p.push('Ajuste no válido.');
  }
  for (const img of d.images) {
    if (!receiptIds.has(img.receiptId)) p.push('Imagen sin ticket.');
    if (!files[img.file]) p.push(`Falta la imagen ${img.file}.`);
  }
  return [...new Set(p)];
}

export async function parseBackupFile(file: Blob): Promise<ParsedBackup> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new BackupValidationError(['El archivo no es un ZIP válido.']);
  }
  const jsonBytes = files['backup.json'];
  if (!jsonBytes) throw new BackupValidationError(['No contiene backup.json.']);
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(strFromU8(jsonBytes)) as BackupManifest;
  } catch {
    throw new BackupValidationError(['backup.json está dañado.']);
  }
  const problems = validateManifest(manifest, files);
  if (problems.length) throw new BackupValidationError(problems);
  const dates = manifest.data.receipts.map((r) => r.purchaseDate).sort();
  return {
    manifest,
    files,
    summary: {
      receipts: manifest.data.receipts.length,
      products: manifest.data.products.length,
      items: manifest.data.receiptItems.length,
      images: manifest.data.images.length,
      exportedAt: manifest.exportedAt,
      firstDate: dates[0] ?? null,
      lastDate: dates[dates.length - 1] ?? null,
    },
  };
}

/** Valores por defecto para copias creadas con versiones anteriores. */
function withReceiptDefaults(r: Receipt): Receipt {
  return { ...r, perceptualHash: r.perceptualHash ?? '', adjustmentsTotalCents: r.adjustmentsTotalCents ?? 0 };
}

function withItemDefaults(it: ReceiptItem): ReceiptItem {
  return { ...it, productAssignment: it.productAssignment ?? 'auto', position: it.position ?? 0 };
}

function toImage(meta: ImageMeta, bytes: Uint8Array): StoredImage {
  const { file: _file, ...rest } = meta;
  return { ...rest, blob: new Blob([bytes as BlobPart], { type: meta.mimeType }) };
}

export interface RestoreResult {
  receiptsAdded: number;
  receiptsSkipped: number;
  referencesChanged: number;
  productsAdded: number;
}

/** Restaura sustituyendo TODOS los datos actuales. */
async function restoreReplace(db: TicketScanDB, parsed: ParsedBackup): Promise<RestoreResult> {
  const d = parsed.manifest.data;
  await db.transaction('rw', db.dataTables, async () => {
    for (const t of db.dataTables) await t.clear();
    await db.receipts.bulkAdd(d.receipts.map(withReceiptDefaults));
    await db.receiptItems.bulkAdd(
      d.receiptItems.map((it) => ({
        ...withItemDefaults(it),
        purchaseDate: it.purchaseDate ?? d.receipts.find((r) => r.id === it.receiptId)?.purchaseDate ?? '',
      })),
    );
    await db.products.bulkAdd(d.products);
    await db.productAliases.bulkPut(d.productAliases);
    await db.receiptAdjustments.bulkAdd(d.receiptAdjustments);
    await db.counters.bulkPut(d.counters);
    for (const meta of d.images) await db.images.add(toImage(meta, parsed.files[meta.file]));
  });
  return { receiptsAdded: d.receipts.length, receiptsSkipped: 0, referencesChanged: 0, productsAdded: d.products.length };
}

/** Importa sin duplicar: omite tickets ya existentes y renumera referencias en conflicto. */
async function restoreMerge(db: TicketScanDB, parsed: ParsedBackup): Promise<RestoreResult> {
  const d = parsed.manifest.data;
  const result: RestoreResult = { receiptsAdded: 0, receiptsSkipped: 0, referencesChanged: 0, productsAdded: 0 };
  await db.transaction('rw', db.dataTables, async () => {
    // Productos: mismo id, o mismo nombre/alias normalizado -> se reutiliza el existente
    const productMap = new Map<string, string>();
    for (const p of d.products) {
      const byId = await db.products.get(p.id);
      if (byId) {
        productMap.set(p.id, byId.id);
        continue;
      }
      const alias = await db.productAliases.where('normalizedAlias').equals(p.normalizedName).first();
      const byName = alias
        ? await db.products.get(alias.productId)
        : await db.products.where('normalizedName').equals(p.normalizedName).first();
      if (byName) {
        productMap.set(p.id, byName.id);
        continue;
      }
      await db.products.add(p);
      productMap.set(p.id, p.id);
      result.productsAdded++;
    }
    for (const a of d.productAliases) {
      const exists = await db.productAliases.where('normalizedAlias').equals(a.normalizedAlias).first();
      if (!exists) await db.productAliases.add({ ...a, id: newId(), productId: productMap.get(a.productId)! });
    }

    for (const r of d.receipts) {
      const sameId = await db.receipts.get(r.id);
      const sameHash = r.contentHash ? await db.receipts.where('contentHash').equals(r.contentHash).first() : undefined;
      if (sameId || sameHash) {
        result.receiptsSkipped++;
        continue;
      }
      let receipt: Receipt = withReceiptDefaults(r);
      const refTaken = await db.receipts.where('reference').equals(r.reference).first();
      if (refTaken) {
        const year = r.referenceYear;
        const counter = await db.counters.get(year);
        let maxSeq = counter?.lastSeq ?? 0;
        await db.receipts
          .where('reference')
          .startsWith(`TKT-${year}-`)
          .each((x) => {
            const pr = parseReference(x.reference);
            if (pr && pr.seq > maxSeq) maxSeq = pr.seq;
          });
        const seq = maxSeq + 1;
        await db.counters.put({ year, lastSeq: seq });
        const note = `Referencia en la copia importada: ${r.reference}`;
        receipt = {
          ...receipt,
          reference: formatReference(year, seq),
          referenceSeq: seq,
          notes: receipt.notes ? `${receipt.notes}\n${note}` : note,
        };
        result.referencesChanged++;
      }
      await db.receipts.add(receipt);
      const items = d.receiptItems
        .filter((it) => it.receiptId === r.id)
        .map((it) => ({
          ...withItemDefaults(it),
          purchaseDate: it.purchaseDate ?? r.purchaseDate,
          productId: productMap.get(it.productId)!,
        }));
      await db.receiptItems.bulkAdd(items);
      await db.receiptAdjustments.bulkAdd(d.receiptAdjustments.filter((a) => a.receiptId === r.id));
      for (const meta of d.images.filter((m) => m.receiptId === r.id)) {
        await db.images.add(toImage(meta, parsed.files[meta.file]));
      }
      result.receiptsAdded++;
    }
    for (const c of d.counters) {
      const cur = await db.counters.get(c.year);
      if (!cur || cur.lastSeq < c.lastSeq) await db.counters.put(c);
    }
  });
  return result;
}

export async function restoreBackup(parsed: ParsedBackup, mode: 'replace' | 'merge'): Promise<RestoreResult> {
  const db = getDb();
  const result = mode === 'replace' ? await restoreReplace(db, parsed) : await restoreMerge(db, parsed);
  if (mode === 'replace' && parsed.manifest.data.settings && db === getMainDb()) {
    const { lastBackupAt: _ignored, ...rest } = parsed.manifest.data.settings;
    await updateSettings(rest);
  }
  return result;
}

// ---------------------------------------------------------------------------
// CSV (compatible con Excel en español: separador ";", coma decimal, UTF-8 con BOM)
// ---------------------------------------------------------------------------

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv(rows: (string | number | null)[][]): Blob {
  const body = rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
  return new Blob(['﻿', body, '\r\n'], { type: 'text/csv;charset=utf-8' });
}

const euros = (c: number | null | undefined) =>
  c === null || c === undefined ? '' : (c / 100).toFixed(2).replace('.', ',');
const num = (n: number) => String(Math.round(n * 1000) / 1000).replace('.', ',');
const ddmmyyyy = (d: string) => (isValidLocalDate(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');

export async function exportReceiptsCsv(): Promise<Blob> {
  const db = getDb();
  const receipts = (await db.receipts.toArray()).sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  const counts = new Map<string, number>();
  await db.receiptItems.each((it) => counts.set(it.receiptId, (counts.get(it.receiptId) ?? 0) + 1));
  const rows: (string | number | null)[][] = [
    ['Referencia', 'Fecha', 'Hora', 'Establecimiento', 'Ref. establecimiento', 'NIF', 'Nº productos', 'Suma líneas (€)', 'Ajustes (€)', 'Total ticket (€)', 'Moneda', 'Fecha estimada', 'Observaciones'],
  ];
  for (const r of receipts) {
    rows.push([
      r.reference,
      ddmmyyyy(r.purchaseDate),
      r.purchaseTime,
      r.merchantName,
      r.merchantReference,
      r.merchantTaxId,
      counts.get(r.id) ?? 0,
      euros(r.calculatedItemsTotalCents),
      euros(r.adjustmentsTotalCents),
      euros(r.printedTotalCents),
      r.currency,
      r.dateEstimated ? 'Sí' : 'No',
      r.notes,
    ]);
  }
  return buildCsv(rows);
}

export async function exportProductsCsv(): Promise<Blob> {
  const db = getDb();
  const [products, items] = await Promise.all([db.products.toArray(), db.receiptItems.toArray()]);
  const rows: (string | number | null)[][] = [
    ['Producto', 'Categoría', 'Cantidad', 'Unidad', 'Gasto total (€)', 'Precio medio (€)', 'Nº tickets', 'Última compra'],
  ];
  const collator = new Intl.Collator('es');
  for (const p of products.sort((a, b) => collator.compare(a.canonicalName, b.canonicalName))) {
    const list = items.filter((i) => i.productId === p.id);
    if (!list.length) continue;
    const total = list.reduce((s, i) => s + i.lineTotalCents, 0);
    const units = new Set(list.map((i) => i.unit));
    const qty = list.reduce((s, i) => s + i.quantity, 0);
    rows.push([
      p.canonicalName,
      p.category,
      units.size === 1 ? num(qty) : '',
      units.size === 1 ? [...units][0] : 'varias',
      euros(total),
      units.size === 1 && qty > 0 ? euros(Math.round(total / qty)) : '',
      new Set(list.map((i) => i.receiptId)).size,
      ddmmyyyy(list.reduce((m, i) => (i.purchaseDate > m ? i.purchaseDate : m), '')),
    ]);
  }
  return buildCsv(rows);
}

export async function exportLinesCsv(): Promise<Blob> {
  const db = getDb();
  const [receipts, products, items] = await Promise.all([db.receipts.toArray(), db.products.toArray(), db.receiptItems.toArray()]);
  const rById = new Map(receipts.map((r) => [r.id, r]));
  const pById = new Map(products.map((p) => [p.id, p]));
  const rows: (string | number | null)[][] = [
    ['Fecha', 'Ticket', 'Establecimiento', 'Producto agrupado', 'Nombre en el ticket', 'Cantidad', 'Unidad', 'Precio unitario (€)', 'Importe (€)'],
  ];
  const sorted = items.sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate) || a.position - b.position);
  for (const it of sorted) {
    const r = rById.get(it.receiptId);
    rows.push([
      ddmmyyyy(it.purchaseDate),
      r?.reference ?? '',
      r?.merchantName ?? '',
      pById.get(it.productId)?.canonicalName ?? '',
      it.productName,
      num(it.quantity),
      it.unit,
      euros(it.unitPriceCents),
      euros(it.lineTotalCents),
    ]);
  }
  return buildCsv(rows);
}
