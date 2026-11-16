import { beforeEach, describe, expect, it } from 'vitest';
import { normalizeProductName, prettifyProductName } from '@/utils/normalize';
import { createReceipt, getReceiptDetails } from '@/services/receiptService';
import {
  addAlias,
  assignItemToProduct,
  createProduct,
  mergeProducts,
  ProductConflictError,
  renameProduct,
  splitProduct,
} from '@/services/productService';
import type { TicketScanDB } from '@/database/db';
import { draft, draftItem, freshDb } from './helpers';

describe('normalización conservadora', () => {
  it('ignora mayúsculas, espacios, acentos y formato de unidades', () => {
    const variants = ['LECHE ENTERA 1L', 'Leche entera 1 l', 'leche entera 1L', '  leche   ENTERA 1 litro ', 'Léche entera 1L.'];
    const set = new Set(variants.map(normalizeProductName));
    expect(set.size).toBe(1);
    expect([...set][0]).toBe('leche entera 1l');
  });
  it('mantiene separados productos parecidos pero distintos', () => {
    const names = ['Leche entera', 'Leche semidesnatada', 'Leche sin lactosa', 'Leche entera 1,5L', 'Leche entera 1L'];
    expect(new Set(names.map(normalizeProductName)).size).toBe(5);
  });
  it('unifica decimales y gramos', () => {
    expect(normalizeProductName('AGUA 1,5 L')).toBe(normalizeProductName('agua 1.5l'));
    expect(normalizeProductName('CAFE 250 GR')).toBe('cafe 250g');
  });
  it('genera nombres legibles', () => {
    expect(prettifyProductName('LECHE ENTERA 1L')).toBe('Leche entera 1L');
    expect(prettifyProductName('Pan de Molde')).toBe('Pan de Molde');
  });
});

describe('agrupación en base de datos', () => {
  let db: TicketScanDB;
  beforeEach(async () => {
    db = await freshDb();
  });

  it('agrupa líneas equivalentes de tickets distintos', async () => {
    await createReceipt(draft('2026-11-01', [draftItem('Leche entera 1L', 120)]), null);
    await createReceipt(draft('2026-11-02', [draftItem('LECHE ENTERA 1 L', 240, 2)]), null);
    await createReceipt(draft('2026-11-03', [draftItem('Leche semidesnatada 1L', 110)]), null);
    const products = await db.products.toArray();
    expect(products).toHaveLength(2);
    const entera = products.find((p) => p.normalizedName === 'leche entera 1l')!;
    const items = await db.receiptItems.where('productId').equals(entera.id).toArray();
    expect(items.reduce((s, i) => s + i.quantity, 0)).toBe(3);
    expect(items.reduce((s, i) => s + i.lineTotalCents, 0)).toBe(360);
    // El nombre original de cada línea se conserva
    expect(items.map((i) => i.rawName).sort()).toEqual(['LECHE ENTERA 1 L', 'Leche entera 1L']);
  });

  it('fusiona productos manualmente y aprende el alias', async () => {
    await createReceipt(draft('2026-11-01', [draftItem('Leche entera', 120)]), null);
    await createReceipt(draft('2026-11-02', [draftItem('Leche ent.', 120)]), null);
    const [a, b] = await db.products.orderBy('normalizedName').toArray();
    await mergeProducts(a.id, b.id);
    expect(await db.products.count()).toBe(1);
    expect(await db.receiptItems.where('productId').equals(b.id).count()).toBe(2);
    // Un ticket nuevo con el nombre fusionado va al producto destino
    await createReceipt(draft('2026-11-03', [draftItem('LECHE ENT', 130)]), null);
    expect(await db.products.count()).toBe(1);
  });

  it('separa líneas mal agrupadas en un producto nuevo', async () => {
    const r1 = await createReceipt(draft('2026-11-01', [draftItem('Yogur', 100)]), null);
    await createReceipt(draft('2026-11-02', [draftItem('Yogur', 100)]), null);
    const product = (await db.products.toArray())[0];
    const line = (await getReceiptDetails(r1.id))!.items[0];
    const newId = await splitProduct(product.id, [line.id], { newName: 'Yogur griego' });
    expect(await db.products.count()).toBe(2);
    const moved = await db.receiptItems.get(line.id);
    expect(moved!.productId).toBe(newId);
    expect(moved!.rawName).toBe('Yogur');
    expect(moved!.productAssignment).toBe('manual');
  });

  it('asigna una línea a un producto existente y elimina productos vacíos', async () => {
    const r = await createReceipt(draft('2026-11-01', [draftItem('Pan barra', 90)]), null);
    const target = await createProduct('Pan');
    const line = (await getReceiptDetails(r.id))!.items[0];
    await assignItemToProduct(line.id, target.id);
    expect((await db.receiptItems.get(line.id))!.productId).toBe(target.id);
    expect(await db.products.where('normalizedName').equals('pan barra').count()).toBe(0);
  });

  it('renombrar no permite colisiones y los alias funcionan', async () => {
    await createReceipt(draft('2026-11-01', [draftItem('Huevos', 300), draftItem('Aceite', 800)]), null);
    const huevos = (await db.products.where('normalizedName').equals('huevos').first())!;
    await expect(renameProduct(huevos.id, 'aceite')).rejects.toBeInstanceOf(ProductConflictError);
    await renameProduct(huevos.id, 'Huevos camperos L');
    await addAlias(huevos.id, 'HVOS CAMP L');
    await createReceipt(draft('2026-11-02', [draftItem('hvos camp l', 310)]), null);
    expect(await db.receiptItems.where('productId').equals(huevos.id).count()).toBe(2);
    // El nombre antiguo sigue agrupando en el mismo producto
    await createReceipt(draft('2026-11-03', [draftItem('HUEVOS', 300)]), null);
    expect(await db.receiptItems.where('productId').equals(huevos.id).count()).toBe(3);
  });
});
