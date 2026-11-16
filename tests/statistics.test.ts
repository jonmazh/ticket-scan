import { beforeEach, describe, expect, it } from 'vitest';
import { createReceipt } from '@/services/receiptService';
import { compare, groupByProduct, monthlyTotals, summarize, topProducts, sortProductStats } from '@/services/statisticsService';
import { resolvePeriod, lastMonths, periodLabel } from '@/utils/dates';
import type { TicketScanDB } from '@/database/db';
import { draft, draftItem, freshDb } from './helpers';

/** Ejemplo del enunciado: tres tickets sintéticos. */
async function seedExample() {
  await createReceipt(draft('2026-11-02', [draftItem('Leche', 120), draftItem('Pan', 150), draftItem('Huevos', 320)]), null);
  await createReceipt(draft('2026-11-09', [draftItem('Leche', 120), draftItem('Aceite', 850), draftItem('Pan', 150)]), null);
  await createReceipt(draft('2026-11-20', [draftItem('Leche', 130), draftItem('Huevos', 320)]), null);
}

describe('estadísticas', () => {
  let db: TicketScanDB;
  beforeEach(async () => {
    db = await freshDb();
  });

  it('agrupa el ejemplo de tres tickets correctamente', async () => {
    await seedExample();
    const [items, products] = await Promise.all([db.receiptItems.toArray(), db.products.toArray()]);
    const stats = sortProductStats(groupByProduct(items, products, { from: null, to: null }), 'spent');
    const byName = Object.fromEntries(stats.map((s) => [s.name, s]));
    expect(byName['Leche']).toMatchObject({ quantity: 3, totalCents: 370, receiptCount: 3 });
    expect(byName['Pan']).toMatchObject({ quantity: 2, totalCents: 300 });
    expect(byName['Huevos']).toMatchObject({ quantity: 2, totalCents: 640 });
    expect(byName['Aceite']).toMatchObject({ quantity: 1, totalCents: 850 });
    expect(byName['Leche'].avgUnitPriceCents).toBe(123);
    expect(byName['Leche'].lastPurchaseDate).toBe('2026-11-20');
  });

  it('respeta el periodo seleccionado usando la fecha de compra', async () => {
    await seedExample();
    await createReceipt(draft('2026-10-31', [draftItem('Leche', 100)]), null);
    const [receipts, items, products] = await Promise.all([db.receipts.toArray(), db.receiptItems.toArray(), db.products.toArray()]);
    const nov = resolvePeriod({ kind: 'month', year: 2026, month: 11 });
    const oct = resolvePeriod({ kind: 'month', year: 2026, month: 10 });
    expect(summarize(receipts, items, nov)).toEqual({ totalCents: 2160, receiptCount: 3, units: 8, lineCount: 8 });
    expect(summarize(receipts, items, oct).totalCents).toBe(100);
    const leche = groupByProduct(items, products, oct).find((s) => s.name === 'Leche')!;
    expect(leche.quantity).toBe(1);
    const all = summarize(receipts, items, { from: null, to: null });
    expect(all.totalCents).toBe(2260);
  });

  it('totales mensuales, comparación y top 5', async () => {
    await seedExample();
    await createReceipt(draft('2026-10-10', [draftItem('Leche', 1000)]), null);
    const [receipts, items, products] = await Promise.all([db.receipts.toArray(), db.receiptItems.toArray(), db.products.toArray()]);
    const months = lastMonths(2026, 11, 6);
    expect(months.map((m) => m.key)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    const totals = monthlyTotals(receipts, months.map((m) => m.key));
    expect(totals.get('2026-11')).toBe(2160);
    expect(totals.get('2026-10')).toBe(1000);
    const c = compare(2160, 1000);
    expect(c.diffCents).toBe(1160);
    expect(c.percent).toBeCloseTo(116);
    expect(compare(100, 0).percent).toBeNull();
    const top = topProducts(groupByProduct(items, products, resolvePeriod({ kind: 'month', year: 2026, month: 11 })));
    expect(top[0].name).toBe('Aceite');
    expect(top.reduce((s, t) => s + t.percent, 0)).toBeCloseTo(100);
  });

  it('usa el total impreso si existe y el calculado si no', async () => {
    await createReceipt(draft('2026-11-01', [draftItem('Pan', 100)], 150), null);
    await createReceipt({ ...draft('2026-11-02', [draftItem('Pan', 100)]), printedTotalCents: null }, null);
    const [receipts, items] = await Promise.all([db.receipts.toArray(), db.receiptItems.toArray()]);
    expect(summarize(receipts, items, { from: null, to: null }).totalCents).toBe(250);
  });

  it('cuenta los productos a peso como una unidad', async () => {
    await createReceipt(draft('2026-11-01', [draftItem('Manzanas', 300, 1.25, 'kg'), draftItem('Pan', 300, 3)]), null);
    const [receipts, items, products] = await Promise.all([db.receipts.toArray(), db.receiptItems.toArray(), db.products.toArray()]);
    expect(summarize(receipts, items, { from: null, to: null }).units).toBe(4);
    const manz = groupByProduct(items, products, { from: null, to: null }).find((s) => s.name === 'Manzanas')!;
    expect(manz).toMatchObject({ quantity: 1.25, unit: 'kg', avgUnitPriceCents: 240 });
  });
});

describe('periodos', () => {
  const today = new Date(2026, 10, 16);
  it('resuelve los periodos predefinidos', () => {
    expect(resolvePeriod({ kind: 'preset', preset: 'this-month' }, today)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(resolvePeriod({ kind: 'preset', preset: 'prev-month' }, today)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(resolvePeriod({ kind: 'preset', preset: 'last-3-months' }, today)).toEqual({ from: '2026-09-01', to: '2026-11-30' });
    expect(resolvePeriod({ kind: 'preset', preset: 'last-6-months' }, today)).toEqual({ from: '2026-06-01', to: '2026-11-30' });
    expect(resolvePeriod({ kind: 'preset', preset: 'this-year' }, today)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(resolvePeriod({ kind: 'preset', preset: 'all' }, today)).toEqual({ from: null, to: null });
    expect(resolvePeriod({ kind: 'month', year: 2024, month: 2 })).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(resolvePeriod({ kind: 'range', from: '2026-05-10', to: '2026-05-01' })).toEqual({ from: '2026-05-01', to: '2026-05-10' });
  });
  it('genera etiquetas en español', () => {
    expect(periodLabel({ kind: 'month', year: 2026, month: 11 })).toBe('Noviembre 2026');
    expect(periodLabel({ kind: 'preset', preset: 'all' })).toBe('Todo el histórico');
  });
});
