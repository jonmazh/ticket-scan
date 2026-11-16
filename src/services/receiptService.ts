import { getDb, type TicketScanDB } from '@/database/db';
import type { DraftAdjustment, DraftItem, ImageVariant, ReceiptDraft, ReceiptImages } from '@/types/drafts';
import type {
  ImageKind,
  Receipt,
  ReceiptAdjustment,
  ReceiptItem,
  StoredImage,
} from '@/types/models';
import { newId, nowIso } from '@/utils/id';
import { normalizeProductName } from '@/utils/normalize';
import { isValidLocalDate } from '@/utils/dates';
import { garbageCollectProducts, resolveProductForName } from './productService';

/**
 * Operaciones CRUD de tickets. Todas las escrituras se hacen en una única
 * transacción para mantener la consistencia entre tickets, líneas, productos,
 * ajustes e imágenes.
 */

export class StorageWriteError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'StorageWriteError';
    (this as { cause?: unknown }).cause = cause;
  }
}

function wrapWriteError(err: unknown): never {
  const name = (err as { name?: string })?.name ?? '';
  const inner = (err as { inner?: { name?: string } })?.inner?.name ?? '';
  if (name === 'QuotaExceededError' || inner === 'QuotaExceededError') {
    throw new StorageWriteError(
      'No queda espacio de almacenamiento en el dispositivo. Libera espacio o exporta una copia y elimina tickets antiguos.',
      err,
    );
  }
  if (err instanceof Error) throw err;
  throw new StorageWriteError('No se ha podido guardar la información.', err);
}

export function formatReference(year: number, seq: number): string {
  return `TKT-${year}-${String(seq).padStart(4, '0')}`;
}

export function parseReference(ref: string): { year: number; seq: number } | null {
  const m = /^TKT-(\d{4})-(\d{4,})$/.exec(ref);
  return m ? { year: parseInt(m[1], 10), seq: parseInt(m[2], 10) } : null;
}

/**
 * Siguiente referencia del año. Combina el contador persistente con la mayor
 * referencia existente, así nunca se reutiliza un número aunque se borren
 * tickets o se importen copias.
 */
export async function allocateReference(db: TicketScanDB, year: number): Promise<{ reference: string; seq: number }> {
  const counter = await db.counters.get(year);
  let maxExisting = 0;
  await db.receipts
    .where('reference')
    .startsWith(`TKT-${year}-`)
    .each((r) => {
      const p = parseReference(r.reference);
      if (p && p.seq > maxExisting) maxExisting = p.seq;
    });
  const seq = Math.max(counter?.lastSeq ?? 0, maxExisting) + 1;
  await db.counters.put({ year, lastSeq: seq });
  return { reference: formatReference(year, seq), seq };
}

export function validateDraft(draft: ReceiptDraft): string[] {
  const errors: string[] = [];
  if (!isValidLocalDate(draft.purchaseDate)) errors.push('La fecha de compra no es válida.');
  if (draft.purchaseTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.purchaseTime)) errors.push('La hora no es válida.');
  draft.items.forEach((it, i) => {
    if (!it.productName.trim()) errors.push(`La línea ${i + 1} no tiene nombre.`);
    if (!(it.quantity > 0)) errors.push(`La cantidad de la línea ${i + 1} debe ser mayor que cero.`);
    if (!Number.isInteger(it.lineTotalCents) || !Number.isInteger(it.unitPriceCents)) {
      errors.push(`Los importes de la línea ${i + 1} no son válidos.`);
    }
  });
  if (draft.items.length === 0 && draft.printedTotalCents === null) {
    errors.push('Añade al menos un producto o el total del ticket.');
  }
  return errors;
}

export function itemsTotal(items: Pick<DraftItem, 'lineTotalCents'>[]): number {
  return items.reduce((s, it) => s + it.lineTotalCents, 0);
}

export function adjustmentsTotal(adjs: Pick<DraftAdjustment, 'amountCents' | 'affectsTotal'>[]): number {
  return adjs.filter((a) => a.affectsTotal).reduce((s, a) => s + a.amountCents, 0);
}

/** Total que se contabiliza como gasto: el impreso si existe; si no, el calculado. */
export function effectiveTotal(r: Pick<Receipt, 'printedTotalCents' | 'calculatedItemsTotalCents' | 'adjustmentsTotalCents'>): number {
  return r.printedTotalCents ?? r.calculatedItemsTotalCents + (r.adjustmentsTotalCents ?? 0);
}

/** Diferencia entre el total impreso y lo calculado (líneas + ajustes). null si no hay total impreso. */
export function totalDifference(
  r: Pick<Receipt, 'printedTotalCents' | 'calculatedItemsTotalCents' | 'adjustmentsTotalCents'>,
): number | null {
  if (r.printedTotalCents === null) return null;
  return r.printedTotalCents - (r.calculatedItemsTotalCents + (r.adjustmentsTotalCents ?? 0));
}

function imageRecord(receiptId: string, kind: ImageKind, v: ImageVariant): StoredImage {
  return {
    id: newId(),
    receiptId,
    kind,
    blob: v.blob,
    mimeType: v.blob.type || 'image/jpeg',
    width: v.width,
    height: v.height,
    size: v.blob.size,
    createdAt: nowIso(),
  };
}

async function writeItems(db: TicketScanDB, receiptId: string, purchaseDate: string, items: DraftItem[]) {
  const existing = await db.receiptItems.where('receiptId').equals(receiptId).toArray();
  const existingById = new Map(existing.map((e) => [e.id, e]));
  const keepIds = new Set(items.filter((i) => i.id).map((i) => i.id!));
  const touchedProducts = new Set<string>(existing.map((e) => e.productId));

  for (const old of existing) if (!keepIds.has(old.id)) await db.receiptItems.delete(old.id);

  let position = 0;
  for (const it of items) {
    const normalizedName = normalizeProductName(it.productName);
    const prev = it.id ? existingById.get(it.id) : undefined;
    let productId: string;
    let assignment = it.productAssignment;
    if (it.productId && (await db.products.get(it.productId))) {
      productId = it.productId;
      if (!prev || prev.productId !== it.productId) assignment = it.productAssignment;
    } else {
      productId = (await resolveProductForName(db, it.productName)).id;
      assignment = 'auto';
    }
    // Si el nombre cambió en una línea agrupada automáticamente, se vuelve a agrupar
    if (prev && assignment === 'auto' && prev.normalizedName !== normalizedName && it.productId === prev.productId) {
      productId = (await resolveProductForName(db, it.productName)).id;
    }
    const record: ReceiptItem = {
      id: prev?.id ?? newId(),
      receiptId,
      productId,
      rawName: prev?.rawName ?? (it.rawName || it.productName),
      productName: it.productName.trim(),
      normalizedName,
      quantity: it.quantity,
      unit: it.unit,
      unitPriceCents: it.unitPriceCents,
      lineTotalCents: it.lineTotalCents,
      originalOcrLine: prev?.originalOcrLine ?? it.originalOcrLine,
      extractionConfidence: it.extractionConfidence,
      productAssignment: assignment,
      purchaseDate,
      position: position++,
      createdAt: prev?.createdAt ?? nowIso(),
    };
    touchedProducts.add(productId);
    await db.receiptItems.put(record);
  }
  await garbageCollectProducts(db, touchedProducts);
}

async function writeAdjustments(db: TicketScanDB, receiptId: string, adjs: DraftAdjustment[]) {
  await db.receiptAdjustments.where('receiptId').equals(receiptId).delete();
  for (const a of adjs) {
    const rec: ReceiptAdjustment = {
      id: a.id ?? newId(),
      receiptId,
      description: a.description.trim() || 'Ajuste',
      type: a.type,
      amountCents: a.amountCents,
      affectsTotal: a.affectsTotal,
    };
    await db.receiptAdjustments.put(rec);
  }
}

export async function createReceipt(
  draft: ReceiptDraft,
  images: ReceiptImages | null,
  options: { now?: Date } = {},
): Promise<Receipt> {
  const errors = validateDraft(draft);
  if (errors.length) throw new Error(errors.join(' '));
  const db = getDb();
  try {
    return await db.transaction('rw', db.dataTables, async () => {
      const now = options.now ?? new Date();
      const year = now.getFullYear();
      const { reference, seq } = await allocateReference(db, year);
      const id = newId();
      const imgRecords: StoredImage[] = [];
      let originalImageId: string | null = null;
      let processedImageId: string | null = null;
      let thumbnailImageId: string | null = null;
      if (images) {
        const o = imageRecord(id, 'original', images.original);
        const t = imageRecord(id, 'thumbnail', images.thumbnail);
        originalImageId = o.id;
        thumbnailImageId = t.id;
        imgRecords.push(o, t);
        if (images.processed) {
          const p = imageRecord(id, 'processed', images.processed);
          processedImageId = p.id;
          imgRecords.push(p);
        }
      }
      const iso = now.toISOString();
      const receipt: Receipt = {
        id,
        reference,
        referenceYear: year,
        referenceSeq: seq,
        merchantName: draft.merchantName.trim(),
        merchantAddress: draft.merchantAddress.trim(),
        merchantTaxId: draft.merchantTaxId.trim(),
        purchaseDate: draft.purchaseDate,
        purchaseTime: draft.purchaseTime,
        dateEstimated: draft.dateEstimated,
        merchantReference: draft.merchantReference.trim(),
        currency: draft.currency,
        printedTotalCents: draft.printedTotalCents,
        calculatedItemsTotalCents: itemsTotal(draft.items),
        adjustmentsTotalCents: adjustmentsTotal(draft.adjustments),
        subtotalCents: draft.subtotalCents,
        notes: draft.notes,
        originalImageId,
        processedImageId,
        thumbnailImageId,
        ocrText: draft.ocrText,
        extractionStatus: draft.extractionStatus,
        createdAt: iso,
        updatedAt: iso,
        contentHash: images?.contentHash ?? '',
        perceptualHash: images?.perceptualHash ?? '',
      };
      await db.receipts.add(receipt);
      if (imgRecords.length) await db.images.bulkAdd(imgRecords);
      await writeItems(db, id, draft.purchaseDate, draft.items);
      await writeAdjustments(db, id, draft.adjustments);
      return receipt;
    });
  } catch (err) {
    wrapWriteError(err);
  }
}

/** Actualiza los datos de un ticket. La referencia interna y las fotografías se conservan. */
export async function updateReceipt(id: string, draft: ReceiptDraft): Promise<Receipt> {
  const errors = validateDraft(draft);
  if (errors.length) throw new Error(errors.join(' '));
  const db = getDb();
  try {
    return await db.transaction('rw', db.dataTables, async () => {
      const current = await db.receipts.get(id);
      if (!current) throw new Error('El ticket no existe.');
      const updated: Receipt = {
        ...current,
        merchantName: draft.merchantName.trim(),
        merchantAddress: draft.merchantAddress.trim(),
        merchantTaxId: draft.merchantTaxId.trim(),
        purchaseDate: draft.purchaseDate,
        purchaseTime: draft.purchaseTime,
        dateEstimated: draft.dateEstimated,
        merchantReference: draft.merchantReference.trim(),
        currency: draft.currency,
        printedTotalCents: draft.printedTotalCents,
        calculatedItemsTotalCents: itemsTotal(draft.items),
        adjustmentsTotalCents: adjustmentsTotal(draft.adjustments),
        subtotalCents: draft.subtotalCents,
        notes: draft.notes,
        updatedAt: nowIso(),
      };
      await db.receipts.put(updated);
      await writeItems(db, id, draft.purchaseDate, draft.items);
      await writeAdjustments(db, id, draft.adjustments);
      return updated;
    });
  } catch (err) {
    wrapWriteError(err);
  }
}

/** Elimina un ticket con sus líneas, ajustes e imágenes (solo las suyas). */
export async function deleteReceipt(id: string): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.dataTables, async () => {
    const items = await db.receiptItems.where('receiptId').equals(id).toArray();
    await db.receiptItems.where('receiptId').equals(id).delete();
    await db.receiptAdjustments.where('receiptId').equals(id).delete();
    await db.images.where('receiptId').equals(id).delete();
    await db.receipts.delete(id);
    await garbageCollectProducts(
      db,
      items.map((i) => i.productId),
    );
  });
}

/** Sustituye o añade la imagen procesada (recorte/rotación) sin tocar la original. */
export async function setProcessedImage(receiptId: string, processed: ImageVariant | null): Promise<void> {
  const db = getDb();
  await db.transaction('rw', db.receipts, db.images, async () => {
    const r = await db.receipts.get(receiptId);
    if (!r) throw new Error('El ticket no existe.');
    if (r.processedImageId) await db.images.delete(r.processedImageId);
    let processedImageId: string | null = null;
    if (processed) {
      const rec = imageRecord(receiptId, 'processed', processed);
      await db.images.add(rec);
      processedImageId = rec.id;
    }
    await db.receipts.update(receiptId, { processedImageId, updatedAt: nowIso() });
  });
}

/** Sustituye la fotografía original (por decisión explícita del usuario). */
export async function replaceReceiptImages(receiptId: string, images: ReceiptImages): Promise<void> {
  const db = getDb();
  try {
    await db.transaction('rw', db.receipts, db.images, async () => {
      const r = await db.receipts.get(receiptId);
      if (!r) throw new Error('El ticket no existe.');
      await db.images.where('receiptId').equals(receiptId).delete();
      const o = imageRecord(receiptId, 'original', images.original);
      const t = imageRecord(receiptId, 'thumbnail', images.thumbnail);
      const recs = [o, t];
      let processedImageId: string | null = null;
      if (images.processed) {
        const p = imageRecord(receiptId, 'processed', images.processed);
        processedImageId = p.id;
        recs.push(p);
      }
      await db.images.bulkAdd(recs);
      await db.receipts.update(receiptId, {
        originalImageId: o.id,
        thumbnailImageId: t.id,
        processedImageId,
        contentHash: images.contentHash,
        perceptualHash: images.perceptualHash,
        updatedAt: nowIso(),
      });
    });
  } catch (err) {
    wrapWriteError(err);
  }
}

export interface DuplicateMatch {
  receipt: Receipt;
  reason: 'same-image' | 'similar-image' | 'same-data';
}

function hamming(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/** Busca tickets que podrían ser el mismo (misma foto, foto casi idéntica o mismos datos). */
export async function findPossibleDuplicates(input: {
  contentHash?: string;
  perceptualHash?: string;
  merchantName?: string;
  purchaseDate?: string;
  totalCents?: number | null;
  excludeId?: string;
}): Promise<DuplicateMatch[]> {
  const db = getDb();
  const out = new Map<string, DuplicateMatch>();
  if (input.contentHash) {
    const same = await db.receipts.where('contentHash').equals(input.contentHash).toArray();
    for (const r of same) out.set(r.id, { receipt: r, reason: 'same-image' });
  }
  if (input.perceptualHash) {
    await db.receipts.each((r) => {
      if (!out.has(r.id) && hamming(r.perceptualHash, input.perceptualHash!) <= 2) {
        out.set(r.id, { receipt: r, reason: 'similar-image' });
      }
    });
  }
  if (input.purchaseDate && input.totalCents !== null && input.totalCents !== undefined) {
    const sameDay = await db.receipts.where('purchaseDate').equals(input.purchaseDate).toArray();
    const merchant = normalizeProductName(input.merchantName ?? '');
    for (const r of sameDay) {
      if (out.has(r.id)) continue;
      const sameTotal = effectiveTotal(r) === input.totalCents;
      const sameMerchant = !merchant || normalizeProductName(r.merchantName) === merchant;
      if (sameTotal && sameMerchant) out.set(r.id, { receipt: r, reason: 'same-data' });
    }
  }
  if (input.excludeId) out.delete(input.excludeId);
  return [...out.values()];
}

export async function getReceiptDetails(id: string) {
  const db = getDb();
  const receipt = await db.receipts.get(id);
  if (!receipt) return null;
  const [items, adjustments] = await Promise.all([
    db.receiptItems.where('receiptId').equals(id).sortBy('position'),
    db.receiptAdjustments.where('receiptId').equals(id).toArray(),
  ]);
  return { receipt, items, adjustments };
}

/** Convierte un ticket guardado en un borrador editable. */
export function receiptToDraft(receipt: Receipt, items: ReceiptItem[], adjustments: ReceiptAdjustment[]): ReceiptDraft {
  return {
    merchantName: receipt.merchantName,
    merchantAddress: receipt.merchantAddress,
    merchantTaxId: receipt.merchantTaxId,
    purchaseDate: receipt.purchaseDate,
    purchaseTime: receipt.purchaseTime,
    dateEstimated: receipt.dateEstimated,
    merchantReference: receipt.merchantReference,
    currency: receipt.currency,
    printedTotalCents: receipt.printedTotalCents,
    subtotalCents: receipt.subtotalCents,
    notes: receipt.notes,
    ocrText: receipt.ocrText,
    extractionStatus: receipt.extractionStatus,
    items: items.map((it) => ({
      key: it.id,
      id: it.id,
      rawName: it.rawName,
      productName: it.productName,
      quantity: it.quantity,
      unit: it.unit,
      unitPriceCents: it.unitPriceCents,
      lineTotalCents: it.lineTotalCents,
      originalOcrLine: it.originalOcrLine,
      extractionConfidence: it.extractionConfidence,
      productId: it.productId,
      productAssignment: it.productAssignment,
    })),
    adjustments: adjustments.map((a) => ({
      key: a.id,
      id: a.id,
      description: a.description,
      type: a.type,
      amountCents: a.amountCents,
      affectsTotal: a.affectsTotal,
    })),
  };
}
