import { TicketScanDB, __setTestDb } from '@/database/db';
import type { DraftItem, ReceiptDraft, ReceiptImages } from '@/types/drafts';
import type { QuantityUnit } from '@/types/models';
import { newId } from '@/utils/id';

let counter = 0;

export async function freshDb(): Promise<TicketScanDB> {
  const db = new TicketScanDB(`test-${Date.now()}-${counter++}`);
  await db.open();
  __setTestDb(db);
  return db;
}

export function draftItem(name: string, totalCents: number, quantity = 1, unit: QuantityUnit = 'ud'): DraftItem {
  return {
    key: newId(),
    rawName: name,
    productName: name,
    quantity,
    unit,
    unitPriceCents: Math.round(totalCents / quantity),
    lineTotalCents: totalCents,
    originalOcrLine: name,
    extractionConfidence: 0.9,
    productId: null,
    productAssignment: 'auto',
  };
}

export function draft(date: string, items: DraftItem[], printedTotalCents: number | null = null, merchant = 'Tienda Demo'): ReceiptDraft {
  return {
    merchantName: merchant,
    merchantAddress: '',
    merchantTaxId: '',
    purchaseDate: date,
    purchaseTime: '',
    dateEstimated: false,
    merchantReference: '',
    currency: 'EUR',
    printedTotalCents: printedTotalCents ?? items.reduce((s, i) => s + i.lineTotalCents, 0),
    subtotalCents: null,
    notes: '',
    ocrText: '',
    extractionStatus: 'manual',
    items,
    adjustments: [],
  };
}

export function fakeImages(tag: string): ReceiptImages {
  const blob = (s: string) => new Blob([s], { type: 'image/jpeg' });
  return {
    original: { blob: blob(`original-${tag}`), width: 100, height: 200 },
    processed: { blob: blob(`processed-${tag}`), width: 90, height: 180 },
    thumbnail: { blob: blob(`thumb-${tag}`), width: 10, height: 20 },
    contentHash: `hash-${tag}`,
    perceptualHash: '0123456789abcdef',
  };
}
