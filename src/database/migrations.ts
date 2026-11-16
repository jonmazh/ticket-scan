import type { Transaction } from 'dexie';

/**
 * Migraciones de datos entre versiones del esquema.
 */

/** v1 -> v2: copia la fecha de compra del ticket a cada línea y añade perceptualHash. */
export async function migrateToV2(tx: Transaction): Promise<void> {
  const receipts = tx.table('receipts');
  const items = tx.table('receiptItems');
  const dates = new Map<string, string>();
  await receipts.toCollection().modify((r: Record<string, unknown>) => {
    dates.set(r.id as string, r.purchaseDate as string);
    if (typeof r.perceptualHash !== 'string') r.perceptualHash = '';
  });
  await items.toCollection().modify((it: Record<string, unknown>) => {
    it.purchaseDate = dates.get(it.receiptId as string) ?? '';
    if (it.productAssignment !== 'manual') it.productAssignment = 'auto';
    if (typeof it.position !== 'number') it.position = 0;
  });
}
