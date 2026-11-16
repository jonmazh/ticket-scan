import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { TicketScanDB, __setTestDb } from '@/database/db';
import { SCHEMA_V1 } from '@/database/schema';
import {
  createReceipt,
  deleteReceipt,
  findPossibleDuplicates,
  getReceiptDetails,
  receiptToDraft,
  totalDifference,
  updateReceipt,
} from '@/services/receiptService';
import { draft, draftItem, fakeImages, freshDb } from './helpers';

describe('tickets: creación, referencias y relaciones', () => {
  let db: TicketScanDB;
  beforeEach(async () => {
    db = await freshDb();
  });

  it('asigna referencias únicas consecutivas que se reinician cada año', async () => {
    const a = await createReceipt(draft('2026-01-05', [draftItem('Pan', 100)]), null, { now: new Date(2026, 0, 5) });
    const b = await createReceipt(draft('2026-02-05', [draftItem('Pan', 100)]), null, { now: new Date(2026, 1, 5) });
    const c = await createReceipt(draft('2027-01-02', [draftItem('Pan', 100)]), null, { now: new Date(2027, 0, 2) });
    expect([a.reference, b.reference, c.reference]).toEqual(['TKT-2026-0001', 'TKT-2026-0002', 'TKT-2027-0001']);
  });

  it('no reutiliza referencias tras borrar un ticket', async () => {
    const now = new Date(2026, 5, 1);
    await createReceipt(draft('2026-06-01', [draftItem('Pan', 100)]), null, { now });
    const b = await createReceipt(draft('2026-06-01', [draftItem('Pan', 100)]), null, { now });
    await deleteReceipt(b.id);
    const c = await createReceipt(draft('2026-06-01', [draftItem('Pan', 100)]), null, { now });
    expect(c.reference).toBe('TKT-2026-0003');
  });

  it('guarda imágenes como Blob y calcula totales', async () => {
    const r = await createReceipt(
      draft('2026-11-01', [draftItem('Leche', 120), draftItem('Pan', 150)], 300),
      fakeImages('a'),
    );
    expect(r.calculatedItemsTotalCents).toBe(270);
    expect(totalDifference(r)).toBe(30);
    const imgs = await db.images.where('receiptId').equals(r.id).toArray();
    expect(imgs.map((i) => i.kind).sort()).toEqual(['original', 'processed', 'thumbnail']);
    expect(imgs.every((i) => i.blob instanceof Blob)).toBe(true);
  });

  it('modifica un ticket conservando referencia e imágenes', async () => {
    const r = await createReceipt(draft('2026-11-01', [draftItem('Leche', 120)]), fakeImages('b'));
    const details = (await getReceiptDetails(r.id))!;
    const d = receiptToDraft(details.receipt, details.items, details.adjustments);
    d.merchantName = 'Otra tienda';
    d.purchaseDate = '2026-10-15';
    d.items[0].quantity = 2;
    d.items[0].lineTotalCents = 240;
    d.items.push(draftItem('Huevos', 320));
    const updated = await updateReceipt(r.id, d);
    expect(updated.reference).toBe(r.reference);
    expect(updated.originalImageId).toBe(r.originalImageId);
    expect(updated.calculatedItemsTotalCents).toBe(560);
    const items = await db.receiptItems.where('receiptId').equals(r.id).toArray();
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.purchaseDate === '2026-10-15')).toBe(true);
    expect(await db.images.where('receiptId').equals(r.id).count()).toBe(3);
  });

  it('elimina un ticket con sus líneas e imágenes sin tocar las de otros', async () => {
    const r1 = await createReceipt(draft('2026-11-01', [draftItem('Leche', 120), draftItem('Solo aquí', 50)]), fakeImages('1'));
    const r2 = await createReceipt(draft('2026-11-02', [draftItem('Leche', 120)]), fakeImages('2'));
    await deleteReceipt(r1.id);
    expect(await db.receipts.count()).toBe(1);
    expect(await db.receiptItems.where('receiptId').equals(r1.id).count()).toBe(0);
    expect(await db.images.where('receiptId').equals(r1.id).count()).toBe(0);
    expect(await db.images.where('receiptId').equals(r2.id).count()).toBe(3);
    // El producto compartido sigue existiendo; el exclusivo se elimina
    const names = (await db.products.toArray()).map((p) => p.normalizedName);
    expect(names).toEqual(['leche']);
  });

  it('detecta posibles duplicados sin borrar nada', async () => {
    const r = await createReceipt(draft('2026-11-01', [draftItem('Leche', 120)], 120, 'Súper X'), fakeImages('dup'));
    const sameImage = await findPossibleDuplicates({ contentHash: 'hash-dup' });
    expect(sameImage.map((d) => d.reason)).toEqual(['same-image']);
    const sameData = await findPossibleDuplicates({ purchaseDate: '2026-11-01', totalCents: 120, merchantName: 'super x' });
    expect(sameData[0].receipt.id).toBe(r.id);
    const none = await findPossibleDuplicates({ contentHash: 'otro', purchaseDate: '2026-11-02', totalCents: 120 });
    expect(none).toHaveLength(0);
    expect(await db.receipts.count()).toBe(1);
  });

  it('rechaza borradores no válidos', async () => {
    await expect(createReceipt(draft('2026-02-30', [draftItem('Pan', 100)]), null)).rejects.toThrow(/fecha/i);
    const bad = draft('2026-02-01', [draftItem('', 100)]);
    await expect(createReceipt(bad, null)).rejects.toThrow(/nombre/i);
  });
});

describe('migraciones', () => {
  it('migra una base de datos v1 a v2 copiando la fecha a las líneas', async () => {
    const name = `migration-${Date.now()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores(SCHEMA_V1);
    await v1.open();
    await v1.table('receipts').add({ id: 'r1', reference: 'TKT-2026-0001', purchaseDate: '2026-03-04', createdAt: '', contentHash: '', merchantName: 'X' });
    await v1.table('receiptItems').add({ id: 'i1', receiptId: 'r1', productId: 'p1', normalizedName: 'pan' });
    v1.close();

    const db = new TicketScanDB(name);
    await db.open();
    __setTestDb(db);
    expect(db.verno).toBe(2);
    const it = await db.receiptItems.get('i1');
    expect(it!.purchaseDate).toBe('2026-03-04');
    expect(it!.productAssignment).toBe('auto');
    expect((await db.receipts.get('r1'))!.perceptualHash).toBe('');
    expect(await db.receiptItems.where('[productId+purchaseDate]').equals(['p1', '2026-03-04']).count()).toBe(1);
  });
});
